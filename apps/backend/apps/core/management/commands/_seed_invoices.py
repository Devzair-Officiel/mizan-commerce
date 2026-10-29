"""Seed factures libres (lot 8.1, URS-110) : brouillons de démo.

- un brouillon complet : client, ligne reprise du catalogue, ligne libre avec unité
  et détails sur plusieurs lignes, délai de paiement ;
- un brouillon vide : ni client ni ligne (états limites de l'éditeur).

Importé par seed_data.py et _seed_e2e.py. Ne pas exécuter directement.
"""
from decimal import Decimal

from apps.invoices.drafts import create_draft_invoice
from apps.invoices.models import Invoice
from apps.products.models import ProductVariant

FREE_LINE = {
    'description': 'Retouche sur mesure',
    'details': 'Reprise des épaules et des manches\nEssayage inclus',
    'unit': 'heure',
    'quantity': Decimal('1.5'),
    'unit_price_ht': Decimal('40.00'),
}


def _catalog_line(shop, product_name: str) -> dict:
    variant = ProductVariant.objects.select_related('product').get(
        shop=shop, product__name=product_name, packaging_name='Par défaut',
    )
    return {
        'description': variant.product.name,
        'quantity': Decimal('2'),
        'unit_price_ht': variant.selling_price,
    }


def seed_invoice_drafts(shop, customer, catalog_product: str, *, stdout=None) -> None:
    """Brouillon complet pour `customer` puis brouillon vide. Idempotent."""
    if Invoice.objects.filter(shop=shop, status=Invoice.STATUS_DRAFT).exists():
        return
    create_draft_invoice(shop, {
        'customer': customer.pk,
        'payment_terms_days': 30,
        'notes': 'Merci de votre confiance.',
        'lines': [_catalog_line(shop, catalog_product), FREE_LINE],
    })
    create_draft_invoice(shop, {})
    if stdout:
        stdout.write('    → 2 brouillons de facture (complet, vide)')
