"""Devis (URS-111) : brouillons, envoi, réponse du client, expiration, conversion.

Un brouillon n'a ni numéro ni date d'envoi : il se modifie (concurrence optimiste
sur `updated_at`) et se supprime. L'envoi réserve le numéro `devis-…`, fige les
instantanés vendeur et acheteur, la présentation et la validité, puis passe le
statut à `sent` par une mise à jour conditionnelle. Ensuite seul le statut change,
toujours par `filter(...).update(...)` : 0 ligne mise à jour = transition refusée.
Un devis ne touche jamais au stock.
"""

from collections.abc import Collection, Mapping, Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.core.audit import log_action
from apps.invoices.drafts import (
    BUYER_FIELDS,
    OPERATION_BY_CATALOG,
    SELLER_FIELDS,
    DraftConflictError,
    _customer,
    _refresh_totals,
    _set_buyer,
    create_draft_invoice,
)
from apps.invoices.models import DocumentSequence, Invoice
from apps.invoices.services import (
    _invoice_options,
    _next_number,
    snapshot_seller_from_shop,
)
from apps.invoices.settings import shop_presentation
from apps.shops.models import Shop

from .compliance import verify_quote
from .models import Quote, QuoteLine

CENT = Decimal('0.01')
DRAFT_FIELDS = (
    'operation_category',
    'payment_terms_days',
    'validity_days',
    'discount_amount',
    'shipping_amount',
    'notes',
)
SEND_FIELDS = (
    'number',
    'sent_at',
    'valid_until',
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
# Champs d'une ligne repris tels quels par la facture issue du devis.
LINE_FIELDS = ('description', 'details', 'unit', 'quantity', 'unit_price_ht')


class QuoteStateError(Exception):
    """Le devis n'est pas dans le statut qu'exige l'opération (réponse 409)."""


def _apply(quote: Quote, data: Mapping[str, Any]) -> None:
    for field in DRAFT_FIELDS:
        if field in data:
            setattr(quote, field, data[field])
    if 'customer' in data:
        _set_buyer(quote, _customer(quote.shop, data['customer']))


def _build_lines(quote: Quote, rows: Sequence[Mapping[str, Any]]) -> list[QuoteLine]:
    return [
        QuoteLine(
            shop=quote.shop,
            quote=quote,
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


@transaction.atomic
def create_draft_quote(shop: Shop, data: Mapping[str, Any]) -> Quote:
    """Brouillon sans numéro ; délai de paiement et nature pris sur la boutique."""
    quote = Quote(
        shop=shop,
        status=Quote.STATUS_DRAFT,
        number='',
        currency=shop.currency,
        seller_name=shop.name,
        operation_category=OPERATION_BY_CATALOG.get(shop.catalog_kind, 'services'),
        payment_terms_days=shop.default_payment_terms_days,
    )
    _apply(quote, data)
    lines = _build_lines(quote, data.get('lines', []))
    _refresh_totals(quote, lines)
    quote.save()
    QuoteLine.objects.bulk_create(lines)
    return quote


def _raise_stale(quote: Quote) -> None:
    status = Quote.objects.filter(pk=quote.pk).values_list('status', flat=True).first()
    if status == Quote.STATUS_DRAFT:
        raise DraftConflictError()
    raise QuoteStateError()


@transaction.atomic
def update_draft_quote(
    quote: Quote, data: Mapping[str, Any], expected_updated_at: datetime
) -> Quote:
    """Concurrence optimiste, comme un brouillon de facture : la mise à jour
    conditionnelle verrouille la ligne ; `lines`, si présent, remplace tout."""
    claimed = Quote.objects.filter(
        pk=quote.pk,
        shop_id=quote.shop_id,
        status=Quote.STATUS_DRAFT,
        updated_at=expected_updated_at,
    ).update(updated_at=timezone.now())
    if not claimed:
        _raise_stale(quote)
    quote = Quote.objects.select_related('shop').get(pk=quote.pk)
    _apply(quote, data)
    if 'lines' in data:
        QuoteLine.objects.filter(quote=quote).delete()
        lines = _build_lines(quote, data['lines'])
        QuoteLine.objects.bulk_create(lines)
    else:
        lines = list(quote.lines.all())
    _refresh_totals(quote, lines)
    quote.save()
    return quote


@transaction.atomic
def delete_draft_quote(quote: Quote) -> None:
    """Un brouillon seulement : un devis envoyé reste, quel que soit son statut."""
    draft = (
        Quote.objects.select_for_update()
        .filter(pk=quote.pk, shop_id=quote.shop_id, status=Quote.STATUS_DRAFT)
        .first()
    )
    if draft is None:
        raise QuoteStateError()
    QuoteLine.objects.filter(quote=draft).delete()
    draft.delete()


def _presentation(quote: Quote, shop: Shop, sent_on: date, **options: Any) -> dict:
    return {
        **shop_presentation(shop, **options),
        'sent_date': sent_on.isoformat(),
        'valid_until': quote.valid_until.isoformat(),
        'validity_days': quote.validity_days,
        'operation_category': quote.operation_category,
    }


def _freeze(quote: Quote, shop: Shop, language: str | None) -> None:
    """Numéro, dates, validité, instantanés et présentation, figés à l'envoi."""
    now = timezone.now()
    sent_on = now.astimezone(ZoneInfo(shop.timezone)).date()
    # Taux déjà appliqué par `_refresh_totals` ; seuls délai et langue servent ici.
    _tax, terms, language = _invoice_options(
        shop, None, quote.payment_terms_days, language
    )
    quote.number = _next_number(shop, DocumentSequence.KIND_QUOTE, sent_on)
    quote.sent_at = now
    quote.valid_until = sent_on + timedelta(days=quote.validity_days)
    quote.payment_terms_days = terms
    quote.currency = shop.currency
    snapshot_seller_from_shop(quote, shop)
    _set_buyer(quote, quote.customer)
    quote.presentation = _presentation(
        quote, shop, sent_on, language=language, terms=terms
    )


@transaction.atomic
def send_quote(
    quote: Quote,
    user: Any,
    *,
    acknowledged_warnings: Collection[str],
    language: str | None = None,
) -> Quote:
    """Envoie un brouillon : sans trou de numérotation, même en cas de double clic.

    Refus (`ComplianceError`) s'il reste un point bloquant ou une recommandation
    non acceptée ; les recommandations acceptées sont tracées dans l'audit.

    Verrou de la boutique (sérialise la série `devis-…`), puis de la ligne : un
    enregistrement en cours se termine avant la lecture des lignes. La mise à jour
    conditionnelle sur `draft` refuse un second envoi, et son échec annule
    l'incrément du compteur. NO KEY UPDATE : un enregistrement qui tient la ligne
    du devis insère ses lignes (contrôle de clé étrangère, FOR KEY SHARE sur la
    boutique) sans interbloquer avec l'envoi.
    """
    shop = Shop.objects.select_for_update(no_key=True).get(pk=quote.shop_id)
    quote = (
        Quote.objects.select_for_update(of=('self',))
        .select_related('customer')
        .get(pk=quote.pk, shop=shop)
    )
    if quote.status != Quote.STATUS_DRAFT:
        raise QuoteStateError()
    quote.shop = shop
    _refresh_totals(quote, quote.lines.all())
    accepted = verify_quote(quote, acknowledged_warnings)
    _freeze(quote, shop, language)
    updated = Quote.objects.filter(pk=quote.pk, status=Quote.STATUS_DRAFT).update(
        status=Quote.STATUS_SENT,
        updated_at=quote.sent_at,
        **{field: getattr(quote, field) for field in SEND_FIELDS},
    )
    if not updated:
        raise QuoteStateError()
    _log(quote, user, 'quote_sent', total_ttc=str(quote.total_ttc), warnings=accepted)
    quote.refresh_from_db()
    return quote


def _log(quote: Quote, user: Any, action: str, **changes: Any) -> None:
    log_action(
        shop_id=quote.shop_id,
        user=user,
        action=action,
        model_name='Quote',
        obj_id=quote.pk,
        obj_repr=quote.number,
        changes=changes,
    )


@transaction.atomic
def _transition(
    quote: Quote,
    user: Any,
    target: str,
    values: Mapping[str, Any],
) -> Quote:
    """Change le statut d'un devis envoyé par une mise à jour conditionnelle,
    sans lecture préalable, et la journalise dans la même transaction.

    Idempotent : sans effet ni journal si le devis est déjà dans le statut visé.
    Depuis un autre statut : `QuoteStateError`.
    """
    updated = Quote.objects.filter(
        pk=quote.pk, shop_id=quote.shop_id, status=Quote.STATUS_SENT
    ).update(status=target, **values)
    quote.refresh_from_db()
    if not updated and quote.status != target:
        raise QuoteStateError()
    if updated:
        _log(quote, user, f'quote_{target}')
    return quote


def mark_accepted_manually(quote: Quote, user: Any, accepted_name: str = '') -> Quote:
    """Accord reçu hors de la page client (téléphone, signature papier)."""
    now = timezone.now()
    return _transition(
        quote,
        user,
        Quote.STATUS_ACCEPTED,
        {
            'accepted_at': now,
            'accepted_name': accepted_name.strip()[:200],
            'updated_at': now,
        },
    )


def mark_declined(quote: Quote, user: Any) -> Quote:
    now = timezone.now()
    return _transition(
        quote, user, Quote.STATUS_DECLINED, {'declined_at': now, 'updated_at': now}
    )


def _invoice_data(quote: Quote) -> dict[str, Any]:
    """Lignes, client et conditions du devis, au format d'un brouillon de facture."""
    return {
        'customer': quote.customer_id,
        'operation_category': quote.operation_category,
        'payment_terms_days': quote.payment_terms_days,
        'discount_amount': quote.discount_amount,
        'shipping_amount': quote.shipping_amount,
        'notes': quote.notes,
        'lines': [
            {field: getattr(line, field) for field in LINE_FIELDS}
            for line in quote.lines.all()
        ],
    }


@transaction.atomic
def convert_quote_to_invoice(quote: Quote, user: Any) -> Invoice:
    """Crée la facture en brouillon d'un devis accepté ; l'émission suit le flux normal.

    Le brouillon est créé, puis la transition le rattache au devis par une mise à
    jour conditionnelle (`accepted`, sans facture). Si elle ne touche aucune ligne
    (devis déjà converti, conversion concurrente, autre statut), l'exception annule
    la transaction : aucun brouillon orphelin, jamais deux factures.
    """
    quote = Quote.objects.select_related('shop').get(pk=quote.pk, shop_id=quote.shop_id)
    invoice = create_draft_invoice(quote.shop, _invoice_data(quote))
    converted = Quote.objects.filter(
        pk=quote.pk,
        shop_id=quote.shop_id,
        status=Quote.STATUS_ACCEPTED,
        invoice__isnull=True,
    ).update(status=Quote.STATUS_INVOICED, invoice=invoice, updated_at=timezone.now())
    if not converted:
        raise QuoteStateError()
    _log(quote, user, 'quote_converted', invoice_id=str(invoice.pk))
    return invoice


def expire_quotes(now: datetime | None = None) -> int:
    """Devis envoyés dont la validité est passée → `expired` ; renvoie leur nombre.

    `valid_until` est une date de la boutique : « aujourd'hui » se calcule dans
    son fuseau, une mise à jour conditionnelle par fuseau.
    """
    now = now or timezone.now()
    zones = (
        Shop.objects.filter(quotes__status=Quote.STATUS_SENT)
        .order_by()
        .values_list('timezone', flat=True)
        .distinct()
    )
    expired = 0
    for zone in zones:
        today = now.astimezone(ZoneInfo(zone)).date()
        expired += Quote.objects.filter(
            shop__timezone=zone,
            status=Quote.STATUS_SENT,
            valid_until__lt=today,
        ).update(status=Quote.STATUS_EXPIRED, updated_at=now)
    return expired
