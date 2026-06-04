from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.orders.models import Order
from apps.shops.models import Shop

from .models import Invoice, InvoiceLine, InvoiceSequence

INVOICE_PREFIX = 'fact'


class InvoiceAlreadyExistsError(Exception):
    """La commande a déjà une facture associée — une commande = une facture (v1)."""

    def __init__(self, invoice_id):
        self.invoice_id = invoice_id
        super().__init__('Une facture existe déjà pour cette commande.')


class EmptyOrderError(Exception):
    """La commande n'a pas d'items — on refuse d'émettre une facture vide."""


def _next_invoice_number(shop: Shop, issued_on: date) -> str:
    """Verrouille (ou crée) le compteur de la boutique, incrémente, retourne le numéro formaté.

    Format : `fact-DDMMYY-NNNN` — préfixe fixe, date d'émission (marqueur, ne reset rien),
    compteur continu par boutique sur 4 chiffres minimum (s'étend naturellement au-delà
    de 9999).

    À appeler **uniquement dans une transaction** (`@transaction.atomic`) : `select_for_update`
    sans transaction lève `TransactionManagementError`. Le verrou ligne empêche deux
    émissions concurrentes de générer le même numéro — garantie de continuité légale.
    """
    sequence, _created = InvoiceSequence.objects.select_for_update().get_or_create(shop=shop)
    sequence.last_number += 1
    sequence.save(update_fields=['last_number', 'updated_at'])

    date_part = issued_on.strftime('%d%m%y')
    return f'{INVOICE_PREFIX}-{date_part}-{sequence.last_number:04d}'


def _snapshot_seller_from_shop(invoice: Invoice, shop: Shop) -> None:
    invoice.seller_name = shop.name
    invoice.seller_address = shop.legal_address
    invoice.seller_tax_id = shop.tax_id
    invoice.seller_legal_mentions = shop.legal_mentions
    invoice.seller_country = shop.country


def _snapshot_buyer_from_order(invoice: Invoice, order: Order) -> None:
    """Snapshot des coordonnées acheteur depuis la commande ou son client lié.

    Si l'`Order` n'a pas de `Customer`, on laisse les champs vides — le commerçant
    pourra éditer la facture en aval si besoin.
    """
    customer = order.customer
    if customer is None:
        return
    invoice.customer = customer
    full_name = f'{customer.first_name} {customer.name}'.strip() if customer.first_name else customer.name
    invoice.buyer_name = full_name
    parts = [customer.address_line]
    if customer.postal_code or customer.city:
        parts.append(f'{customer.postal_code} {customer.city}'.strip())
    invoice.buyer_address = '\n'.join(p for p in parts if p)
    invoice.buyer_city = customer.city
    invoice.buyer_postal_code = customer.postal_code
    invoice.buyer_country = customer.country
    invoice.buyer_email = customer.email
    invoice.buyer_phone = customer.phone


def _build_lines_from_order(invoice: Invoice, order: Order) -> list[InvoiceLine]:
    """Snapshot des items de commande en lignes de facture HT."""
    lines: list[InvoiceLine] = []
    for item in order.items.all():
        suffix = f' ({item.variant_name})' if item.variant_name else ''
        description = f'{item.product_name}{suffix}'
        unit_ht = Decimal(str(item.unit_price)).quantize(Decimal('0.01'))
        qty = Decimal(str(item.quantity))
        subtotal = (unit_ht * qty).quantize(Decimal('0.01'))
        lines.append(
            InvoiceLine(
                shop=invoice.shop,
                invoice=invoice,
                description=description,
                quantity=qty,
                unit_price_ht=unit_ht,
                line_subtotal_ht=subtotal,
            )
        )
    return lines


def _compute_totals(
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
    taxable_base = (subtotal_ht - discount_amount + shipping_amount).quantize(Decimal('0.01'))
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
) -> Invoice:
    """Émet une facture définitive à partir d'une commande.

    Atomique : la numérotation et l'écriture des lignes se font dans la même transaction
    que l'incrément du `InvoiceSequence`. Si quoi que ce soit échoue, aucun numéro n'est
    consommé (rollback) — préserve la continuité de la séquence.

    `tax_rate` et `payment_terms_days` peuvent être surchargés par appel ; sinon on prend
    les valeurs par défaut de la boutique.
    """
    if not order.items.exists():
        raise EmptyOrderError()

    existing = Invoice.objects.filter(order=order).values_list('pk', flat=True).first()
    if existing is not None:
        raise InvoiceAlreadyExistsError(invoice_id=existing)

    now = timezone.now()
    number = _next_invoice_number(shop, now.date())

    effective_tax_rate = tax_rate if tax_rate is not None else shop.default_tax_rate
    effective_terms = payment_terms_days if payment_terms_days is not None else shop.default_payment_terms_days

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
        due_date=(now + timedelta(days=effective_terms)).date(),
        paid_at=now if initial_status == Invoice.STATUS_PAID else None,
        cancelled_at=now if initial_status == Invoice.STATUS_CANCELLED else None,
        currency=shop.currency,
        tax_rate=Decimal(str(effective_tax_rate)),
        discount_amount=discount_amount,
        shipping_amount=shipping_amount,
        amount_paid=Decimal(str(order.amount_paid or 0)),
        notes=notes,
    )
    _snapshot_seller_from_shop(invoice, shop)
    _snapshot_buyer_from_order(invoice, order)

    lines = _build_lines_from_order(invoice, order)
    subtotal_ht, tax_amount, total_ttc = _compute_totals(
        lines, invoice.tax_rate, discount_amount, shipping_amount,
    )
    invoice.subtotal_ht = subtotal_ht
    invoice.tax_amount = tax_amount
    invoice.total_ttc = total_ttc

    invoice.save()
    InvoiceLine.objects.bulk_create(lines)
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
        invoice.save(update_fields=['status', 'amount_paid', 'cancelled_at', 'updated_at'])
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


def mark_paid(invoice: Invoice) -> Invoice:
    """Bascule en `paid` (idempotent : sans effet si déjà payée)."""
    if invoice.status == Invoice.STATUS_PAID:
        return invoice
    invoice.status = Invoice.STATUS_PAID
    invoice.paid_at = timezone.now()
    invoice.amount_paid = invoice.total_ttc
    invoice.save(update_fields=['status', 'paid_at', 'amount_paid', 'updated_at'])
    return invoice


def cancel_invoice(invoice: Invoice) -> Invoice:
    """Bascule en `cancelled` — pas d'avoir en v1, juste un drapeau de statut.

    Le numéro reste attribué (ne se recycle pas) : exigence légale, la trace doit subsister.
    """
    if invoice.status == Invoice.STATUS_CANCELLED:
        return invoice
    invoice.status = Invoice.STATUS_CANCELLED
    invoice.cancelled_at = timezone.now()
    invoice.save(update_fields=['status', 'cancelled_at', 'updated_at'])
    return invoice
