"""Boutique des audits Playwright — compte e2e@example.com (articles et services, EUR).

Importé par seed_data.py via ``from ._seed_e2e import run_seed_e2e``.
Les audits y créent tout ce dont ils ont besoin : les autres boutiques de démo
restent intactes. Ne pas exécuter directement.
"""
from decimal import Decimal

from apps.customers.factories import CustomerFactory
from apps.orders import services as order_services
from apps.products.models import Product, ProductVariant
from apps.stock.services import create_movement

# Client avec une commande impayée : l'audit y teste « Relancer » (WhatsApp).
E2E_FOLLOWUP_CUSTOMER = 'Nadia Relance'


def _variant(shop, name: str, ptype: str, price: str) -> ProductVariant:
    product, _ = Product.objects.get_or_create(
        shop=shop, name=name, defaults={'type': ptype},
    )
    variant, _ = ProductVariant.objects.get_or_create(
        product=product,
        packaging_name='Par défaut',
        defaults={
            'shop': shop,
            'unit': 'piece',
            'base_quantity': Decimal('1'),
            'selling_price': Decimal(price),
            'position': 0,
        },
    )
    return variant


def _order(shop, owner, customer, variant, status: str, paid: bool) -> None:
    order = order_services.create_order(shop, owner, customer=customer)
    order_services.add_item(order, variant, 1)
    order_services.advance_order_to(order, status, owner)
    if paid:
        order.refresh_from_db()
        order_services.update_payment(order, order.total_amount, owner)


def run_seed_e2e(shop, owner, *, stdout=None) -> None:
    """Quelques articles, services, clients et commandes. Idempotent."""
    tote = _variant(shop, 'Sac cabas en toile', 'product', '29.00')
    candle = _variant(shop, 'Bougie parfumée', 'product', '18.50')
    retouche = _variant(shop, 'Retouche ourlet', 'service', '12.00')
    for variant, qty in ((tote, 20), (candle, 8)):
        if not variant.stock_movements.exists():
            create_movement(
                shop, variant, 'in', qty, reason='Stock initial — seeding',
                created_by=owner,
            )

    if not shop.customers.exists():
        nadia = CustomerFactory(
            shop=shop, name=E2E_FOLLOWUP_CUSTOMER, phone='+33611000101',
            city='Lyon', notes='',
        )
        marc = CustomerFactory(
            shop=shop, name='Marc Dupuis', phone='+33611000102',
            city='Grenoble', notes='',
        )
        _order(shop, owner, nadia, tote, 'to_prepare', paid=False)
        _order(shop, owner, marc, retouche, 'shipped', paid=True)

    if stdout:
        stdout.write(
            f'    + {Product.objects.filter(shop=shop).count()} articles et services, '
            f'{shop.customers.count()} clients, {shop.orders.count()} commandes'
        )
