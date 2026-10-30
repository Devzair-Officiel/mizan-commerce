"""Facture libre (URS-110) : brouillons, émission et suggestions de lignes.

Un brouillon n'a ni numéro, ni date d'émission : il se modifie (concurrence
optimiste sur `updated_at`) et se supprime. L'émission réserve le numéro, fige
les instantanés et passe le statut à `issued` par une mise à jour conditionnelle,
dans une seule transaction : un échec n'y consomme aucun numéro.
"""

from collections.abc import Collection, Mapping, Sequence
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.audit import log_action
from apps.customers.models import Customer
from apps.products.models import ProductVariant
from apps.shops.models import Shop

from .compliance import ComplianceIssue, check_invoice
from .models import BillingDocument, BillingLine, DocumentSequence, Invoice, InvoiceLine
from .services import (
    _invoice_options,
    _next_number,
    compute_totals,
    display_line_description,
    line_description,
    snapshot_buyer,
    snapshot_seller_from_shop,
)
from .settings import snapshot_presentation

CENT = Decimal('0.01')
DRAFT_FIELDS = (
    'operation_category',
    'payment_terms_days',
    'discount_amount',
    'shipping_amount',
    'notes',
)
BUYER_FIELDS = (
    'buyer_name',
    'buyer_address',
    'buyer_city',
    'buyer_postal_code',
    'buyer_country',
    'buyer_email',
    'buyer_phone',
    'buyer_siren',
)
SELLER_FIELDS = (
    'seller_name',
    'seller_address',
    'seller_tax_id',
    'seller_legal_mentions',
    'seller_country',
)
ISSUE_FIELDS = (
    'number',
    'issued_at',
    'due_date',
    'payment_terms_days',
    'currency',
    'tax_rate',
    'subtotal_ht',
    'tax_amount',
    'total_ttc',
    'presentation',
    'customer',
    *SELLER_FIELDS,
    *BUYER_FIELDS,
)
# Nature de l'opération proposée selon le catalogue, toujours modifiable.
OPERATION_BY_CATALOG = {'services': 'services', 'products': 'goods', 'both': 'mixed'}
CATALOG_SUGGESTIONS = 5
MAX_SUGGESTIONS = 8


class DraftConflictError(Exception):
    """Le brouillon a changé depuis sa lecture (autre onglet, autre appareil)."""


class NotDraftError(Exception):
    """La facture n'est plus un brouillon : ni modification, ni suppression."""


class ComplianceError(Exception):
    """Émission refusée : point bloquant, ou recommandation non acceptée."""

    def __init__(self, issues: list[ComplianceIssue], *, blocking: bool) -> None:
        self.issues = issues
        self.blocking = blocking
        super().__init__('Vérification avant émission.')


def _tax_rate(shop: Shop) -> Decimal:
    if shop.invoice_vat_regime == 'exempt':
        return Decimal('0')
    return shop.default_tax_rate


def _customer(shop: Shop, customer_id: Any) -> Customer | None:
    if customer_id is None:
        return None
    customer = Customer.objects.filter(shop=shop, pk=customer_id).first()
    if customer is None:
        raise ValidationError({'customer': 'Client introuvable.'})
    return customer


def _set_buyer(invoice: BillingDocument, customer: Customer | None) -> None:
    invoice.customer = None
    for field in BUYER_FIELDS:
        setattr(invoice, field, '')
    snapshot_buyer(invoice, customer)


def _apply(invoice: Invoice, data: Mapping[str, Any]) -> None:
    for field in DRAFT_FIELDS:
        if field in data:
            setattr(invoice, field, data[field])
    if 'customer' in data:
        _set_buyer(invoice, _customer(invoice.shop, data['customer']))


def _build_lines(
    invoice: Invoice, rows: Sequence[Mapping[str, Any]]
) -> list[InvoiceLine]:
    return [
        InvoiceLine(
            shop=invoice.shop,
            invoice=invoice,
            description=row['description'],
            details=row.get('details', ''),
            unit=row.get('unit', ''),
            quantity=row['quantity'],
            unit_price_ht=row['unit_price_ht'],
            line_subtotal_ht=(row['unit_price_ht'] * row['quantity']).quantize(CENT),
            position=position,
        )
        for position, row in enumerate(rows)
    ]


def _refresh_totals(invoice: BillingDocument, lines: Sequence[BillingLine]) -> None:
    invoice.tax_rate = _tax_rate(invoice.shop)
    invoice.subtotal_ht, invoice.tax_amount, invoice.total_ttc = compute_totals(
        list(lines), invoice.tax_rate, invoice.discount_amount, invoice.shipping_amount
    )


@transaction.atomic
def create_draft_invoice(shop: Shop, data: Mapping[str, Any]) -> Invoice:
    """Brouillon sans numéro ; délai et nature de l'opération pris sur la boutique."""
    invoice = Invoice(
        shop=shop,
        status=Invoice.STATUS_DRAFT,
        number='',
        currency=shop.currency,
        seller_name=shop.name,
        operation_category=OPERATION_BY_CATALOG.get(shop.catalog_kind, 'services'),
        payment_terms_days=shop.default_payment_terms_days,
    )
    _apply(invoice, data)
    lines = _build_lines(invoice, data.get('lines', []))
    _refresh_totals(invoice, lines)
    invoice.save()
    InvoiceLine.objects.bulk_create(lines)
    return invoice


def _raise_stale(invoice: Invoice) -> None:
    status = (
        Invoice.objects.filter(pk=invoice.pk).values_list('status', flat=True).first()
    )
    if status == Invoice.STATUS_DRAFT:
        raise DraftConflictError()
    raise NotDraftError()


@transaction.atomic
def update_draft_invoice(
    invoice: Invoice, data: Mapping[str, Any], expected_updated_at: datetime
) -> Invoice:
    """Concurrence optimiste : la version lue doit être la version enregistrée.

    La mise à jour conditionnelle verrouille la ligne jusqu'à la fin de la
    transaction ; `lines`, si présent, remplace toutes les lignes.
    """
    claimed = Invoice.objects.filter(
        pk=invoice.pk,
        shop_id=invoice.shop_id,
        status=Invoice.STATUS_DRAFT,
        updated_at=expected_updated_at,
    ).update(updated_at=timezone.now())
    if not claimed:
        _raise_stale(invoice)
    invoice = Invoice.objects.select_related('shop').get(pk=invoice.pk)
    _apply(invoice, data)
    if 'lines' in data:
        InvoiceLine.objects.filter(invoice=invoice).delete()
        lines = _build_lines(invoice, data['lines'])
        InvoiceLine.objects.bulk_create(lines)
    else:
        lines = list(invoice.lines.all())
    _refresh_totals(invoice, lines)
    invoice.save()
    return invoice


@transaction.atomic
def delete_draft_invoice(invoice: Invoice, user: Any) -> None:
    """Un brouillon seulement : une facture émise ne se supprime jamais."""
    draft = (
        Invoice.objects.select_for_update()
        .filter(pk=invoice.pk, shop_id=invoice.shop_id, status=Invoice.STATUS_DRAFT)
        .first()
    )
    if draft is None:
        raise NotDraftError()
    InvoiceLine.objects.filter(invoice=draft).delete()
    draft.delete()
    log_action(
        shop_id=invoice.shop_id,
        user=user,
        action='invoice_draft_deleted',
        model_name='Invoice',
        obj_id=invoice.pk,
        obj_repr=f'Brouillon {draft.buyer_name}'.strip()[:200],
        changes={'total_ttc': str(draft.total_ttc)},
    )


def _verify(invoice: Invoice, acknowledged: Collection[str]) -> list[str]:
    """Codes des recommandations acceptées ; refus si un point reste ouvert."""
    issues = check_invoice(invoice)
    if any(issue.level == 'blocking' for issue in issues):
        raise ComplianceError(issues, blocking=True)
    if any(issue.code not in acknowledged for issue in issues):
        raise ComplianceError(issues, blocking=False)
    return [issue.code for issue in issues]


def _freeze(invoice: Invoice, shop: Shop, language: str | None) -> None:
    """Numéro, dates, instantanés et présentation, comme une facture de commande."""
    now = timezone.now()
    issued_on = now.astimezone(ZoneInfo(shop.timezone)).date()
    # Taux déjà appliqué par `_refresh_totals` ; seuls délai et langue servent ici.
    _tax, terms, language = _invoice_options(
        shop, None, invoice.payment_terms_days, language
    )
    invoice.number = _next_number(shop, DocumentSequence.KIND_INVOICE, issued_on)
    invoice.issued_at = now
    invoice.due_date = issued_on + timedelta(days=terms)
    invoice.payment_terms_days = terms
    invoice.currency = shop.currency
    snapshot_seller_from_shop(invoice, shop)
    _set_buyer(invoice, invoice.customer)
    invoice.presentation = snapshot_presentation(
        invoice, shop, language=language, terms=terms
    )
    # Choisie sur l'éditeur ; une facture de commande n'en imprime pas.
    invoice.presentation['operation_category'] = invoice.operation_category


@transaction.atomic
def issue_invoice(
    invoice: Invoice,
    user: Any,
    *,
    acknowledged_warnings: Collection[str],
    language: str | None = None,
) -> Invoice:
    """Émet un brouillon : sans trou de numérotation, même en cas de double clic.

    Le verrou de la boutique sérialise les émissions (comme
    `issue_invoice_from_order`) ; la mise à jour conditionnelle sur `draft` refuse
    une seconde émission, et son échec annule l'incrément du compteur.
    """
    # NO KEY UPDATE : sérialise les émissions sans bloquer le contrôle de clé
    # étrangère (FOR KEY SHARE) des insertions de la boutique ; FOR UPDATE
    # interbloquait avec un enregistrement qui tient la ligne du document.
    shop = Shop.objects.select_for_update(no_key=True).get(pk=invoice.shop_id)
    # Verrou de la ligne : un enregistrement en cours se termine avant la lecture,
    # l'émission ne fige jamais des lignes ou des totaux périmés.
    invoice = (
        Invoice.objects.select_for_update(of=('self',))
        .select_related('customer')
        .get(pk=invoice.pk, shop=shop)
    )
    if invoice.status != Invoice.STATUS_DRAFT:
        raise NotDraftError()
    invoice.shop = shop
    _refresh_totals(invoice, invoice.lines.all())
    accepted = _verify(invoice, acknowledged_warnings)
    _freeze(invoice, shop, language)
    updated = Invoice.objects.filter(pk=invoice.pk, status=Invoice.STATUS_DRAFT).update(
        status=Invoice.STATUS_ISSUED,
        updated_at=invoice.issued_at,
        **{field: getattr(invoice, field) for field in ISSUE_FIELDS},
    )
    if not updated:
        raise NotDraftError()
    log_action(
        shop_id=shop.pk,
        user=user,
        action='invoice_issued',
        model_name='Invoice',
        obj_id=invoice.pk,
        obj_repr=invoice.number,
        changes={'total_ttc': str(invoice.total_ttc), 'warnings': accepted},
    )
    invoice.refresh_from_db()
    return invoice


def _catalog_suggestions(shop: Shop, query: str) -> list[dict[str, str]]:
    variants = (
        ProductVariant.objects.filter(
            shop=shop,
            is_active=True,
            product__is_active=True,
            product__name__icontains=query,
        )
        .select_related('product')
        .order_by('product__name', 'position')[:CATALOG_SUGGESTIONS]
    )
    return [
        {
            'source': 'catalog',
            'product_id': str(v.product_id),
            'description': line_description(v.product.name, v.packaging_name),
            'details': '',
            'unit': v.unit_label,
            'unit_price_ht': str(v.selling_price),
            'invoice_number': '',
        }
        for v in variants
    ]


def _previous_line_suggestions(
    shop: Shop, query: str, seen: set[str], room: int
) -> list[dict[str, str]]:
    """Lignes déjà facturées, la plus récente d'abord, une par désignation."""
    lines = (
        InvoiceLine.objects.filter(
            shop=shop,
            invoice__status__in=(Invoice.STATUS_ISSUED, Invoice.STATUS_PAID),
            description__icontains=query,
        )
        .select_related('invoice')
        .order_by('-invoice__issued_at', 'position')[:40]
    )
    found = []
    for line in lines:
        description = display_line_description(line.description)
        if len(found) >= room or description.casefold() in seen:
            continue
        seen.add(description.casefold())
        found.append({
            'source': 'invoice_line',
            'product_id': '',
            'description': description,
            'details': line.details,
            'unit': line.unit,
            'unit_price_ht': str(line.unit_price_ht),
            'invoice_number': line.invoice.number,
        })
    return found


def line_suggestions(shop: Shop, query: str) -> list[dict[str, str]]:
    """Catalogue puis lignes déjà facturées de la boutique, 8 au plus."""
    query = query.strip()
    if not query:
        return []
    catalog = _catalog_suggestions(shop, query)
    seen = {item['description'].casefold() for item in catalog}
    room = MAX_SUGGESTIONS - len(catalog)
    return catalog + _previous_line_suggestions(shop, query, seen, room)
