"""Services des réglages et de leur instantané (URS-094 / URS-099)."""

from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.public_pages.models import ContactButton, PublicPage
from apps.shops.models import Shop
from .colors import accessible_color
from .models import Invoice, InvoiceLine


PAYMENT_METHODS = ('cash', 'card', 'transfer', 'cheque')


def resolved_color(shop: Shop) -> str:
    if shop.invoice_color_mode == 'neutral':
        return ''
    color = (
        shop.invoice_color
        if shop.invoice_color_mode == 'custom'
        else shop.invoice_auto_color
    )
    if shop.invoice_color_mode == 'automatic' and not shop.logo_object_key:
        return ''
    return accessible_color(color) if color else ''


@transaction.atomic
def update_invoice_settings(shop: Shop, data: dict) -> Shop:
    shop = Shop.objects.select_for_update().get(pk=shop.pk)
    for field, value in data.items():
        setattr(
            shop, field, accessible_color(value) if field == 'invoice_color' else value
        )
    if shop.invoice_vat_regime == 'exempt':
        shop.default_tax_rate = Decimal('0')
    shop.save()
    return shop


def snapshot_presentation(
    invoice: Invoice, shop: Shop, *, language: str, terms: int
) -> dict:
    page = PublicPage.objects.filter(shop=shop).first()
    contacts = ContactButton.objects.filter(
        page__shop=shop, type__in=('email', 'phone')
    )
    methods = list(shop.invoice_payment_methods)
    transfer = 'transfer' in methods
    order = invoice.order
    return {
        'version': 1,
        'language': 'en' if language == 'en' else 'fr',
        'color': resolved_color(shop),
        'logo_object_key': shop.logo_object_key,
        'activity': page.tagline if page else '',
        'contacts': [{'type': c.type, 'value': c.value} for c in contacts],
        'siret': shop.siret,
        'vat_regime': shop.invoice_vat_regime,
        'vat_number': shop.vat_number
        if shop.invoice_vat_regime == 'applicable'
        else '',
        'payment_terms_days': terms,
        'payment_methods': methods,
        'iban': shop.invoice_iban if transfer else '',
        'bic': shop.invoice_bic if transfer else '',
        'order_number': order.order_number if shop.invoice_show_order and order else '',
        'order_date': order.created_at.astimezone(ZoneInfo(shop.timezone))
        .date()
        .isoformat()
        if shop.invoice_show_order and order
        else '',
        'show_account_summary': shop.invoice_show_account_summary,
        'account_summary': account_summary(invoice)
        if shop.invoice_show_account_summary
        else None,
    }


def account_summary(invoice: Invoice) -> dict:
    """Dettes antérieures nettes et règlements de la présente facture.

    Les paiements des autres factures sont déjà déduits de previous_balance.
    Sans client identifié, ne jamais agréger les ventes anonymes de la boutique.
    """
    previous = []
    if invoice.customer_id:
        previous = list(
            Invoice.objects.filter(
                shop_id=invoice.shop_id,
                customer_id=invoice.customer_id,
                issued_at__lt=invoice.issued_at,
                status=Invoice.STATUS_ISSUED,
                total_ttc__gt=0,
            ).exclude(pk=invoice.pk)
        )
    unpaid = [(i, max(Decimal('0'), i.total_ttc - i.amount_paid)) for i in previous]
    balance = sum((amount for _, amount in unpaid), Decimal('0'))
    received = min(max(invoice.amount_paid, Decimal('0')), invoice.total_ttc)
    return {
        'previous_invoices': [
            {'number': i.number, 'due': str(amount)} for i, amount in unpaid if amount
        ],
        'previous_balance': str(balance),
        'payments_received': str(received),
        'current_invoice': str(invoice.total_ttc),
        'total_balance': str(balance + invoice.total_ttc - received),
    }


def example_invoice(shop: Shop, language: str) -> Invoice:
    """Exemple en mémoire : aucun numéro consommé, aucune facture enregistrée."""
    now = timezone.now()
    issued_on = now.astimezone(ZoneInfo(shop.timezone)).date()
    invoice = Invoice(
        shop=shop,
        number='EXEMPLE-0001',
        issued_at=now,
        due_date=issued_on + timedelta(days=shop.default_payment_terms_days),
        seller_name=shop.name,
        seller_address=shop.legal_address,
        seller_country=shop.country,
        seller_tax_id=shop.tax_id,
        seller_legal_mentions=shop.legal_mentions,
        buyer_name='Example customer' if language == 'en' else 'Client exemple',
        buyer_address='8 rue Victor Hugo\n69002 Lyon',
        currency=shop.currency,
        subtotal_ht=Decimal('79.97'),
        discount_amount=Decimal('0'),
        shipping_amount=Decimal('0'),
        tax_rate=shop.default_tax_rate
        if shop.invoice_vat_regime == 'applicable'
        else Decimal('0'),
        amount_paid=Decimal('30'),
        status=Invoice.STATUS_ISSUED,
    )
    invoice.tax_amount = (invoice.subtotal_ht * invoice.tax_rate / 100).quantize(
        Decimal('0.01')
    )
    invoice.total_ttc = invoice.subtotal_ht + invoice.tax_amount
    invoice.presentation = snapshot_presentation(
        invoice, shop, language=language, terms=shop.default_payment_terms_days
    )
    lines = [
        InvoiceLine(
            shop=shop,
            invoice=invoice,
            product_name=name,
            variant_name=variant,
            description=name,
            quantity=qty,
            unit_price_ht=Decimal(price),
            line_subtotal_ht=Decimal(price) * qty,
        )
        for name, variant, qty, price in [
            ('Chemise en lin blanc', 'Taille M', 2, '29.99'),
            ('Ceinture tressée marron', '', 1, '19.99'),
        ]
    ]
    invoice._prefetched_objects_cache = {'lines': lines}
    return invoice
