"""Boutiques des audits Playwright — comptes e2e@example.com, e2e2@… (EUR).

Importé par seed_data.py et reset_audit_shop.py via
``from ._seed_e2e import seed_audit_shop``.
Les audits y créent tout ce dont ils ont besoin : les autres boutiques de démo
restent intactes. Ne pas exécuter directement.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.factories import UserFactory
from apps.customers.factories import CustomerFactory
from apps.orders import services as order_services
from apps.products.models import Product, ProductVariant
from apps.shops.factories import ShopFactory, ShopMemberFactory
from apps.shops.models import Shop
from apps.stock.services import create_movement
from apps.subscriptions.models import Subscription, SubscriptionPlan

# Comptes des boutiques d'audit : un par emplacement, les audits lancés en parallèle
# (apps/frontend/e2e/run-audits.mjs) travaillent chacun sur leurs propres données.
# S'y ajoute la boutique réservée à audit-invoices, qui compte ses factures au plus
# près : celles d'invoice-settings et d'order-numbers ne doivent pas s'y mêler.
INVOICES_AUDIT = 'invoices'
AUDIT_EMAIL_RE = r'^e2e([0-9]*|-invoices)@example\.com$'


def audit_emails(slot: int | str) -> tuple[str, str]:
    """Propriétaire et employée (rappels attribués, badge) de l'emplacement `slot`.

    1 → e2e@example.com / e2e-staff@example.com,
    2 → e2e2@example.com / e2e2-staff@example.com…,
    'invoices' → e2e-invoices@example.com / e2e-invoices-staff@example.com.
    """
    if isinstance(slot, str):
        prefix = f'e2e-{slot}'
    else:
        prefix = 'e2e' if slot == 1 else f'e2e{slot}'
    return f'{prefix}@example.com', f'{prefix}-staff@example.com'


def _shop_name(slot: int | str) -> str:
    if slot == INVOICES_AUDIT:
        return 'Boutique Audit Factures'
    return 'Boutique Audit' if slot == 1 else f'Boutique Audit {slot}'

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


def _order(
    shop, owner, customer, variant, status: str, paid: bool, days_ago: int = 0,
) -> None:
    order = order_services.create_order(shop, owner, customer=customer)
    order_services.add_item(order, variant, 1)
    order_services.advance_order_to(order, status, owner)
    if paid:
        order.refresh_from_db()
        order_services.update_payment(order, order.total_amount, owner)
    if days_ago:
        shop.orders.filter(pk=order.pk).update(
            created_at=timezone.now() - timedelta(days=days_ago),
        )


def run_seed_e2e(shop, owner, *, stdout=None) -> None:
    """Quelques articles, services, clients et commandes. Idempotent."""
    tote = _variant(shop, 'Sac cabas en toile', 'product', '29.00')
    candle = _variant(shop, 'Bougie parfumée', 'product', '18.50')
    retouche = _variant(shop, 'Retouche ourlet', 'service', '12.00')
    for variant, qty in ((tote, 20), (candle, 8)):
        if not variant.stock_movements.exists():
            create_movement(
                shop, variant, 'in', qty, reason='Stock initial — seeding',
                created_by=owner, is_initial=True,
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
        # Impayée depuis 5 jours : la tâche des rappels automatiques la relance.
        _order(shop, owner, nadia, tote, 'to_prepare', paid=False, days_ago=5)
        _order(shop, owner, marc, retouche, 'shipped', paid=True)

    if stdout:
        stdout.write(
            f'    + {Product.objects.filter(shop=shop).count()} articles et services, '
            f'{shop.customers.count()} clients, {shop.orders.count()} commandes'
        )


def seed_audit_shop(*, slot: int | str = 1, stdout=None) -> Shop:
    """Compte d'audit de l'emplacement `slot` et sa boutique (Boutique). Idempotent.

    `slot` est un numéro d'emplacement, ou `INVOICES_AUDIT` pour la boutique réservée.
    """
    email, staff_email = audit_emails(slot)
    e2e = UserFactory(
        email=email,
        full_name='Audit Playwright',
        phone='+33611000100',
        password='Mizan1234!',
    )
    shop = ShopFactory(name=_shop_name(slot), currency='EUR', country='FR')
    ShopMemberFactory(shop=shop, user=e2e, role='owner')
    staff = UserFactory(
        email=staff_email,
        full_name='Inès Martin',
        phone='+33611000103',
        password='Mizan1234!',
    )
    ShopMemberFactory(
        shop=shop, user=staff, role='staff',
        permissions=['orders', 'customers', 'reminders'],
    )
    Subscription.objects.update_or_create(
        shop=shop,
        defaults={
            'plan': SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_BOUTIQUE),  # noqa: E501
            'status': Subscription.STATUS_ACTIVE,
            'current_period_start': timezone.now(),
            'current_period_end': None,
        },
    )
    if e2e.trial_consumed_at is None:
        e2e.trial_consumed_at = timezone.now()
        e2e.save(update_fields=['trial_consumed_at', 'updated_at'])
    shop.catalog_kind = 'both'
    shop.fulfillment_mode = 'on_site'
    if shop.onboarding_completed_at is None:
        shop.onboarding_completed_at = timezone.now()
    shop.save(update_fields=['catalog_kind', 'fulfillment_mode', 'onboarding_completed_at', 'updated_at'])  # noqa: E501
    if stdout:
        stdout.write(f'  ✓ Boutique audits : {shop.name}')
    run_seed_e2e(shop, e2e, stdout=stdout)
    return shop
