"""Jeu de présentation de la maquette, sans écriture en base."""

from datetime import datetime, timezone
from decimal import Decimal

from apps.shops.models import Shop
from .models import Invoice, InvoiceLine
from .settings import example_invoice


def _reference_shop(neutral: bool) -> Shop:
    return Shop(
        name='La Boutique de Youssef',
        currency='EUR',
        country='FR',
        legal_address='12 rue des Lilas, 75011 Paris',
        siret='91234567800012',
        invoice_color_mode='neutral' if neutral else 'custom',
        invoice_color='#9c4f2c',
        invoice_vat_regime='exempt',
        invoice_payment_methods=['cash', 'card', 'transfer'],
        invoice_iban='FR7630006000011234567890189',
        invoice_bic='AGRIFRPP',
        invoice_show_account_summary=True,
        default_payment_terms_days=30,
        legal_mentions='Aucun escompte pour paiement anticipé.',
    )


def reference_invoice(*, neutral: bool = False, lines: int = 3) -> Invoice:
    shop = _reference_shop(neutral)
    # Maquette de référence : la boutique n'est pas en base, pas de formule à lire.
    invoice = example_invoice(shop, 'fr', branded=True)
    invoice.number = 'fact-131026-0007'
    invoice.issued_at = datetime(2026, 10, 13, 10, tzinfo=timezone.utc)
    invoice.due_date = datetime(2026, 11, 12).date()
    invoice.buyer_name = 'Karima Bensouda'
    invoice.buyer_address = '8 rue Victor Hugo, 69002 Lyon'
    invoice.buyer_email = 'karima.b@exemple.fr'
    invoice.buyer_phone = '+33 6 12 34 56 78'
    invoice.discount_amount = Decimal('5')
    items = _sample_lines(invoice, shop, lines)
    invoice._prefetched_objects_cache = {'lines': items}
    invoice.subtotal_ht = sum(i.line_subtotal_ht for i in items)
    invoice.total_ttc = invoice.subtotal_ht - invoice.discount_amount
    invoice.presentation.update(
        {
            'issued_date': '2026-10-13',
            'activity': 'Prêt-à-porter et accessoires',
            'contacts': [
                {
                    'type': 'email',
                    'value': 'contact@boutique-youssef.fr',
                },
                {'type': 'phone', 'value': '+33123456789'},
            ],
            'order_number': '2026-054',
            'order_date': '2026-10-13',
            'account_summary': {
                'previous_invoices': [
                    {'number': 'fact-111026-0003', 'due': '24.90'},
                    {'number': 'fact-121026-0005', 'due': '50.00'},
                ],
                'previous_balance': '74.90',
                'payments_received': '30.00',
                'current_invoice': str(invoice.total_ttc),
                'total_balance': str(
                    Decimal('74.90') + invoice.total_ttc - invoice.amount_paid
                ),
            },
        }
    )
    return invoice


def _sample_lines(invoice: Invoice, shop: Shop, lines: int) -> list[InvoiceLine]:
    items = list(invoice.lines.all())
    for i in range(2, lines):
        name = (
            'Frais de livraison' if i == 2 else f'Article de démonstration {i + 1:02d}'
        )
        items.append(
            InvoiceLine(
                shop=shop,
                invoice=invoice,
                description=name,
                product_name=name,
                quantity=1,
                unit_price_ht=Decimal('4.90'),
                line_subtotal_ht=Decimal('4.90'),
            )
        )
    return items
