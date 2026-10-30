from collections.abc import Mapping
from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Count, F, Q, QuerySet, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.orders.services import current_month_bounds
from apps.products.constants import DEFAULT_VARIANT_NAME, is_default_variant
from apps.shops.models import Shop

from .models import Invoice, InvoiceLine, InvoiceSequence
from .settings import snapshot_presentation

INVOICE_PREFIX = 'fact'


class InvoiceAlreadyExistsError(Exception):
    """La commande a déjà une facture associée — une commande = une facture (v1)."""

    def __init__(self, invoice_id):
        self.invoice_id = invoice_id
        super().__init__('Une facture existe déjà pour cette commande.')


class EmptyOrderError(Exception):
    """La commande n'a pas d'items — on refuse d'émettre une facture vide."""


class InvoiceStateError(Exception):
    """Transition impossible depuis le statut actuel (brouillon, facture annulée)."""


def _next_invoice_number(shop: Shop, issued_on: date) -> str:
    """Verrouille (ou crée) le compteur de la boutique, incrémente, retourne le numéro formaté.

    Format : `fact-DDMMYY-NNNN` — préfixe fixe, date d'émission (marqueur, ne reset rien),
    compteur continu par boutique sur 4 chiffres minimum (s'étend naturellement au-delà
    de 9999).

    À appeler **uniquement dans une transaction** (`@transaction.atomic`) : `select_for_update`
    sans transaction lève `TransactionManagementError`. Le verrou ligne empêche deux
    émissions concurrentes de générer le même numéro — garantie de continuité légale.
    """  # noqa: E501
    sequence, _created = InvoiceSequence.objects.select_for_update().get_or_create(
        shop=shop
    )  # noqa: E501
    sequence.last_number += 1
    sequence.save(update_fields=['last_number', 'updated_at'])

    date_part = issued_on.strftime('%d%m%y')
    return f'{INVOICE_PREFIX}-{date_part}-{sequence.last_number:04d}'


def snapshot_seller_from_shop(invoice: Invoice, shop: Shop) -> None:
    invoice.seller_name = shop.name
    invoice.seller_address = shop.legal_address
    invoice.seller_tax_id = shop.tax_id
    invoice.seller_legal_mentions = shop.legal_mentions
    invoice.seller_country = shop.country


def snapshot_buyer(invoice: Invoice, customer: Customer | None) -> None:
    """Snapshot des coordonnées acheteur depuis le client.

    Sans client, les champs restent vides. Le SIREN n'est repris que pour un
    client professionnel.
    """
    if customer is None:
        return
    invoice.customer = customer
    invoice.buyer_name = customer.display_name
    parts = [customer.address_line]
    if customer.postal_code or customer.city:
        parts.append(f'{customer.postal_code} {customer.city}'.strip())
    invoice.buyer_address = '\n'.join(p for p in parts if p)
    invoice.buyer_city = customer.city
    invoice.buyer_postal_code = customer.postal_code
    invoice.buyer_country = customer.country
    invoice.buyer_email = customer.email
    invoice.buyer_phone = customer.phone
    invoice.buyer_siren = customer.siren if customer.customer_type == 'business' else ''


_DEFAULT_VARIANT_SUFFIX = f' ({DEFAULT_VARIANT_NAME})'


def line_description(product_name: str, variant_name: str) -> str:
    """Libellé d'une ligne : « Article (format) », sauf format par défaut."""
    if not variant_name or is_default_variant(variant_name):
        return product_name
    return f'{product_name} ({variant_name})'


def display_line_description(description: str) -> str:
    """Libellé affiché d'une ligne (détail et PDF).

    Les factures émises avant `line_description` portent « (Par défaut) » et
    restent figées en base : le suffixe est masqué à l'affichage seulement.
    """
    return description.removesuffix(_DEFAULT_VARIANT_SUFFIX)


def _build_lines_from_order(invoice: Invoice, order: Order) -> list[InvoiceLine]:
    """Snapshot des items de commande en lignes de facture HT."""
    lines: list[InvoiceLine] = []
    for position, item in enumerate(order.items.all()):
        description = line_description(item.product_name, item.variant_name)
        unit_ht = Decimal(str(item.unit_price)).quantize(Decimal('0.01'))
        qty = Decimal(str(item.quantity))
        subtotal = (unit_ht * qty).quantize(Decimal('0.01'))
        lines.append(
            InvoiceLine(
                shop=invoice.shop,
                invoice=invoice,
                description=description,
                product_name=item.product_name,
                variant_name=''
                if is_default_variant(item.variant_name)
                else item.variant_name,
                quantity=qty,
                unit_price_ht=unit_ht,
                line_subtotal_ht=subtotal,
                position=position,
            )
        )
    return lines


def compute_totals(
    lines: list[InvoiceLine],
    tax_rate: Decimal,
    discount_amount: Decimal,
    shipping_amount: Decimal,
) -> tuple[Decimal, Decimal, Decimal]:
    """Retourne (subtotal_ht, tax_amount, total_ttc) arrondis au centime.

    Règle TVA FR/UE — la base imposable inclut les frais de port (accessoires à
    la vente) et déduit les remises commerciales :
        base = subtotal_ht − discount + shipping
        tax = base × taux
        total_ttc = base + tax
    """
    subtotal_ht = sum((line.line_subtotal_ht for line in lines), Decimal('0'))
    subtotal_ht = subtotal_ht.quantize(Decimal('0.01'))
    taxable_base = (subtotal_ht - discount_amount + shipping_amount).quantize(
        Decimal('0.01')
    )  # noqa: E501
    tax_amount = (taxable_base * tax_rate / Decimal('100')).quantize(Decimal('0.01'))
    total_ttc = (taxable_base + tax_amount).quantize(Decimal('0.01'))
    return subtotal_ht, tax_amount, total_ttc


@transaction.atomic
def issue_invoice_from_order(
    *,
    shop: Shop,
    order: Order,
    tax_rate: Decimal | None = None,
    payment_terms_days: int | None = None,
    notes: str = '',
    language: str | None = None,
) -> Invoice:
    """Émet une facture définitive à partir d'une commande.

    Atomique : la numérotation et l'écriture des lignes se font dans la même transaction
    que l'incrément du `InvoiceSequence`. Si quoi que ce soit échoue, aucun numéro n'est
    consommé (rollback) — préserve la continuité de la séquence.

    `tax_rate` et `payment_terms_days` peuvent être surchargés par appel ; sinon on prend
    les valeurs par défaut de la boutique.
    """  # noqa: E501
    # NO KEY UPDATE : sérialise les émissions sans bloquer le contrôle de clé
    # étrangère (FOR KEY SHARE) des insertions de la boutique ; FOR UPDATE
    # interbloquait avec un enregistrement qui tient la ligne du document.
    shop = Shop.objects.select_for_update(no_key=True).get(pk=shop.pk)
    order = (
        Order.objects.select_for_update(of=('self',))
        .select_related('customer')
        .get(pk=order.pk, shop=shop)
    )
    if not order.items.exists():
        raise EmptyOrderError()

    existing = (
        Invoice.objects.filter(shop=shop, order=order)
        .values_list('pk', flat=True)
        .first()
    )
    if existing is not None:
        raise InvoiceAlreadyExistsError(invoice_id=existing)

    now = timezone.now()
    issued_on = now.astimezone(ZoneInfo(shop.timezone)).date()
    number = _next_invoice_number(shop, issued_on)

    effective_tax_rate, effective_terms, language = _invoice_options(
        shop,
        tax_rate,
        payment_terms_days,
        language,
    )
    invoice = _new_invoice(
        shop, order, now, issued_on, number, effective_tax_rate, effective_terms, notes
    )
    lines = _build_lines_from_order(invoice, order)
    invoice.subtotal_ht, invoice.tax_amount, invoice.total_ttc = compute_totals(
        lines,
        invoice.tax_rate,
        invoice.discount_amount,
        invoice.shipping_amount,
    )
    invoice.presentation = snapshot_presentation(
        invoice, shop, language=language, terms=effective_terms
    )
    invoice.save()
    InvoiceLine.objects.bulk_create(lines)
    return invoice


def _invoice_options(
    shop: Shop,
    tax_rate: Decimal | None,
    payment_terms_days: int | None,
    language: str | None,
) -> tuple[Decimal, int, str]:
    effective_tax_rate = tax_rate if tax_rate is not None else shop.default_tax_rate
    if shop.invoice_vat_regime == 'exempt':
        effective_tax_rate = Decimal('0')
    effective_terms = (
        payment_terms_days
        if payment_terms_days is not None
        else shop.default_payment_terms_days
    )  # noqa: E501

    if not 0 <= effective_terms <= 365 or not 0 <= effective_tax_rate <= 100:
        raise ValidationError('Taux ou délai invalide.')
    if language is None:
        language = (
            shop.members.filter(role='owner')
            .values_list('user__language', flat=True)
            .first()
            or 'fr'
        )
    return effective_tax_rate, effective_terms, language


def _new_invoice(
    shop, order, now, issued_on, number, effective_tax_rate, effective_terms, notes
) -> Invoice:
    # Synchro initiale avec le statut de la commande : si elle est déjà payée
    # ou annulée, la facture naît dans le même état.
    if order.status == 'cancelled':
        initial_status = Invoice.STATUS_CANCELLED
    elif order.payment_status == 'paid':
        initial_status = Invoice.STATUS_PAID
    else:
        initial_status = Invoice.STATUS_ISSUED

    discount_amount = Decimal(str(order.discount_amount or 0)).quantize(Decimal('0.01'))
    shipping_amount = Decimal(str(order.shipping_amount or 0)).quantize(Decimal('0.01'))

    invoice = Invoice(
        shop=shop,
        order=order,
        number=number,
        status=initial_status,
        issued_at=now,
        due_date=issued_on + timedelta(days=effective_terms),
        paid_at=now if initial_status == Invoice.STATUS_PAID else None,
        cancelled_at=now if initial_status == Invoice.STATUS_CANCELLED else None,
        currency=shop.currency,
        tax_rate=Decimal(str(effective_tax_rate)),
        discount_amount=discount_amount,
        shipping_amount=shipping_amount,
        amount_paid=Decimal(str(order.amount_paid or 0)),
        notes=notes,
    )
    snapshot_seller_from_shop(invoice, shop)
    # Sans client sur la commande, les champs acheteur restent vides.
    snapshot_buyer(invoice, order.customer)

    return invoice


def sync_invoice_from_order(order: Order) -> None:
    """Aligne le statut de la facture liée sur celui de la commande.

    Règles, par priorité :
    1. Commande annulée → facture annulée (terminal).
    2. Commande payée intégralement → facture payée.
    3. Commande non payée ou partielle → facture émise.

    Une facture déjà annulée reste annulée (état terminal légal). Appelée depuis
    `orders.services` après tout changement de paiement ou d'annulation.
    """
    invoice = getattr(order, 'invoice', None)
    if invoice is None:
        return
    if invoice.status == Invoice.STATUS_CANCELLED:
        return

    now = timezone.now()
    order_amount_paid = Decimal(str(order.amount_paid or 0))
    invoice.amount_paid = order_amount_paid

    if order.status == 'cancelled':
        invoice.status = Invoice.STATUS_CANCELLED
        invoice.cancelled_at = now
        invoice.save(
            update_fields=['status', 'amount_paid', 'cancelled_at', 'updated_at']
        )  # noqa: E501
        return

    if order.payment_status == 'paid':
        if invoice.status != Invoice.STATUS_PAID:
            invoice.status = Invoice.STATUS_PAID
            invoice.paid_at = now
        invoice.save(update_fields=['status', 'amount_paid', 'paid_at', 'updated_at'])
        return

    # unpaid / partial → repasser la facture en émise si elle était payée
    if invoice.status == Invoice.STATUS_PAID:
        invoice.status = Invoice.STATUS_ISSUED
        invoice.paid_at = None
    invoice.save(update_fields=['status', 'amount_paid', 'paid_at', 'updated_at'])


def _transition(
    invoice: Invoice, sources: tuple[str, ...], target: str, values: dict
) -> Invoice:
    """Change le statut par une mise à jour conditionnelle, sans lecture préalable.

    Idempotent : sans effet si la facture est déjà dans le statut visé. Depuis un
    autre statut (brouillon, facture annulée) : `InvoiceStateError`.
    """
    updated = Invoice.objects.filter(pk=invoice.pk, status__in=sources).update(
        status=target, **values
    )
    invoice.refresh_from_db()
    if not updated and invoice.status != target:
        raise InvoiceStateError()
    return invoice


def mark_paid(invoice: Invoice) -> Invoice:
    """Bascule une facture émise en `paid`, avec ou sans commande liée."""
    now = timezone.now()
    return _transition(
        invoice,
        (Invoice.STATUS_ISSUED,),
        Invoice.STATUS_PAID,
        {'paid_at': now, 'amount_paid': F('total_ttc'), 'updated_at': now},
    )


def cancel_invoice(invoice: Invoice) -> Invoice:
    """Bascule en `cancelled` — pas d'avoir en v1, juste un drapeau de statut.

    Le numéro reste attribué (ne se recycle pas) : exigence légale, la trace doit subsister.
    Un brouillon ne s'annule pas : il se supprime (`drafts.delete_draft_invoice`).
    """  # noqa: E501
    now = timezone.now()
    return _transition(
        invoice,
        (Invoice.STATUS_ISSUED, Invoice.STATUS_PAID),
        Invoice.STATUS_CANCELLED,
        {'cancelled_at': now, 'updated_at': now},
    )


# Liste, indicateurs et facettes (URS-097 / URS-099).
DUE = Q(status='issued', total_ttc__gt=F('amount_paid'))
PAYMENTS = {
    'due': DUE,
    'unpaid': Q(status='issued', amount_paid=0),
    'partial': DUE & Q(amount_paid__gt=0),
    'paid': Q(status='paid'),
}


def filter_invoices(
    qs: QuerySet, shop: Shop, params: Mapping[str, str], *, skip: str = ''
) -> QuerySet:
    if skip != 'status' and params.get('status'):
        qs = qs.filter(status=params['status'])
    if skip != 'payment' and params.get('payment') in PAYMENTS:
        qs = qs.filter(PAYMENTS[params['payment']])
    period = params.get('period')
    if period in ('issued_month', 'paid_month'):
        start, end = current_month_bounds(shop)
        if period == 'paid_month':
            qs = qs.filter(status='paid', paid_at__gte=start, paid_at__lt=end)
        else:
            qs = qs.filter(issued_at__gte=start, issued_at__lt=end)
    return qs


def invoice_facets(shop: Shop, qs: QuerySet, params: Mapping[str, str]) -> dict:
    """Chaque menu compte la recherche et tous les filtres sauf le sien."""
    statuses = filter_invoices(qs, shop, params, skip='status').aggregate(
        all=Count('id'),
        **{s: Count('id', filter=Q(status=s)) for s, _ in Invoice.STATUS_CHOICES},
    )
    payments = filter_invoices(qs, shop, params, skip='payment').aggregate(
        all=Count('id'),
        **{name: Count('id', filter=condition) for name, condition in PAYMENTS.items()},
    )
    return {'status': statuses, 'payment': payments}


def invoice_summary(shop: Shop) -> dict:
    """Mêmes ensembles que les filtres des trois indicateurs cliquables."""
    qs = Invoice.objects.filter(shop=shop)
    due = qs.filter(DUE).aggregate(
        count=Count('id'), amount=Sum(F('total_ttc') - F('amount_paid'))
    )
    result = {
        'due': {'count': due['count'], 'amount': str(due['amount'] or Decimal('0'))}
    }
    for period in ('issued_month', 'paid_month'):
        values = filter_invoices(qs, shop, {'period': period}).aggregate(
            count=Count('id'), amount=Sum('total_ttc')
        )
        result[period] = {
            'count': values['count'],
            'amount': str(values['amount'] or Decimal('0')),
        }
    return result
