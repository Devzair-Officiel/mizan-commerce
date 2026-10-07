"""Jeu de données réaliste — Atelier Samira (services/EUR).

Importé par seed_data.py via ``from ._seed_services import run_seed_services``.
Ne pas exécuter directement.
"""
import datetime
import zoneinfo
from decimal import Decimal

from django.utils import timezone

from apps.customers.factories import CustomerFactory
from apps.orders import services as order_services
from apps.products.models import Product, ProductVariant

_TZ_FR = zoneinfo.ZoneInfo("Europe/Paris")


def _make_dt(date: datetime.date, hour: int, minute: int) -> datetime.datetime:
    return datetime.datetime(
        date.year, date.month, date.day, hour, minute, tzinfo=_TZ_FR,
    )


def _antidate_order(order, target_dt: datetime.datetime) -> None:
    from apps.orders.models import Order, OrderItem
    Order.objects.filter(pk=order.pk).update(created_at=target_dt)
    OrderItem.objects.filter(order=order).update(created_at=target_dt)


def _seed_service(shop, name: str, price: str) -> ProductVariant:
    product, _ = Product.objects.get_or_create(
        shop=shop,
        name=name,
        defaults={'type': 'service'},
    )
    variant, _ = ProductVariant.objects.get_or_create(
        product=product,
        packaging_name='Prestation',
        defaults={
            'shop': shop,
            'unit': 'piece',
            'base_quantity': Decimal('1'),
            'selling_price': Decimal(price),
            'position': 0,
        },
    )
    return variant


def _create_service_order(
    shop,
    owner,
    customer,
    variants: list,
    pay_status: str,
    ord_status: str,
) -> 'order_services.Order':
    """Crée une commande avec articles puis transitions vers le statut voulu."""
    order = order_services.create_order(shop, owner, customer=customer)
    for variant in variants:
        order_services.add_item(order, variant, 1)

    # Transition draft → to_prepare
    if ord_status in ('to_prepare', 'prepared', 'shipped'):
        order_services.transition_status(order, 'to_prepare', owner)

    # Transition to_prepare → prepared
    if ord_status in ('prepared', 'shipped'):
        order_services.transition_status(order, 'prepared', owner)

    # Transition prepared → shipped
    if ord_status == 'shipped':
        order_services.transition_status(order, 'shipped', owner)

    # Paiement
    amount_paid = Decimal('0')
    if pay_status == 'paid':
        amount_paid = order.total_amount
    elif pay_status == 'partial':
        amount_paid = (order.total_amount / Decimal('2')).quantize(Decimal('0.01'))

    if amount_paid > 0:
        order_services.update_payment(order, amount_paid, owner)

    return order


def run_seed_services(shop, owner, *, stdout=None) -> None:
    if stdout:
        stdout.write('  Seeding Atelier Samira…')

    # ── 5 services ──────────────────────────────────────────────
    coupe = _seed_service(shop, 'Coupe femme', '35.00')
    coupe_h = _seed_service(shop, 'Coupe homme', '20.00')
    brushing = _seed_service(shop, 'Brushing', '25.00')
    couleur = _seed_service(shop, 'Coloration', '60.00')
    soin = _seed_service(shop, 'Soin kératine', '90.00')

    if stdout:
        count_svc = Product.objects.filter(shop=shop).count()
        stdout.write(f'    + {count_svc} services créés')

    # ── Quelques clients ─────────────────────────────────────────
    if not shop.customers.exists():
        nadia = CustomerFactory(shop=shop, name='Nadia Alami', phone='+33611000001')
        leila = CustomerFactory(shop=shop, name='Leïla Mansouri', phone='+33611000002')
        hind = CustomerFactory(shop=shop, name='Hind Berrada')
    else:
        from apps.customers.models import Customer
        customers = list(Customer.objects.filter(shop=shop)[:3])
        nadia = customers[0]
        leila = customers[1] if len(customers) > 1 else customers[0]
        hind = customers[2] if len(customers) > 2 else customers[0]

    # ── ~10 commandes sur 2 semaines ─────────────────────────────
    today = timezone.localdate(timezone=_TZ_FR)
    d = datetime.timedelta
    orders_data = [
        (today - d(days=13), nadia, [coupe, brushing], 'paid', 'shipped', 10, 14),
        (today - d(days=11), leila, [couleur], 'paid', 'shipped', 9, 30),
        (today - d(days=10), hind, [coupe_h], 'paid', 'shipped', 11, 0),
        (today - d(days=8), nadia, [soin], 'unpaid', 'to_prepare', 14, 0),
        (today - d(days=7), leila, [coupe, soin], 'paid', 'shipped', 10, 45),
        (today - d(days=5), hind, [brushing], 'paid', 'shipped', 15, 30),
        (today - d(days=4), nadia, [couleur], 'partial', 'to_prepare', 9, 0),
        (today - d(days=2), leila, [coupe_h], 'paid', 'shipped', 11, 30),
        (today - d(days=1), hind, [coupe, brushing], 'unpaid', 'to_prepare', 10, 0),
        (today, nadia, [soin], 'paid', 'to_prepare', 13, 0),
    ]

    for date, customer, variants, pay_status, ord_status, hour, minute in orders_data:
        order = _create_service_order(shop, owner, customer, variants, pay_status, ord_status)  # noqa: E501
        target_dt = _make_dt(date, hour, minute)
        _antidate_order(order, target_dt)

    if stdout:
        from apps.orders.models import Order
        count = Order.objects.filter(shop=shop).count()
        stdout.write(f'    + {count} commandes créées')
