"""Re-seed des 4 plans canoniques.

Les data migrations `subscriptions.0002_seed_plans` et `0004_rename_plans`
posent les plans au bootstrap.
Ce command sert au cas où l'admin veut rafraîchir les libellés, prix, ou
features_json en dev/staging sans repasser par une migration.

Idempotent (update_or_create). Ne supprime jamais un plan : un plan obsolète
doit être désactivé via `is_active=False`, pas effacé (référencé par des
souscriptions existantes via FK PROTECT).

Usage :
    docker compose exec backend python manage.py seed_plans
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.subscriptions.models import SubscriptionPlan

_FREE = ['products', 'stock', 'notes', 'reminders', 'orders', 'zakat', 'product_scan']
_SOLO = _FREE + ['invoices', 'whatsapp', 'zakat_history', 'auto_reminders']
_BOUTIQUE = _SOLO + [
    'multi_user', 'roles_permissions', 'invoice_branding', 'message_templates',
    'daily_digest', 'sales_stats', 'exports', 'public_pages', 'loyalty', 'ocr',
    'visual_inventory', 'qr_codes', 'partnerships',
]
_COMMERCE_PLUS = _BOUTIQUE + ['audit_log', 'priority_support']

PLANS = [
    {
        'code': SubscriptionPlan.CODE_FREE,
        'name': 'Découverte',
        'description': "L'essentiel pour démarrer, sans engagement.",
        'price_amount': Decimal('0'),
        'price_yearly_amount': Decimal('0'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_LIFETIME,
        'max_products': 30,
        'max_orders_per_month': 15,
        'max_customers': 15,
        'max_members': 1,
        'max_vision_scans_per_month': 5,
        'max_text_scans_per_month': 10,
        'features_json': _FREE,
        'is_active': True,
    },
    {
        'code': SubscriptionPlan.CODE_SOLO,
        'name': 'Solo',
        'description': 'Pour le commerçant qui gère seul sa boutique.',
        'price_amount': Decimal('9'),
        'price_yearly_amount': Decimal('90'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_MONTH,
        'max_products': None,
        'max_orders_per_month': None,
        'max_customers': None,
        'max_members': 1,
        'max_vision_scans_per_month': 30,
        'max_text_scans_per_month': 30,
        'features_json': _SOLO,
        'is_active': True,
    },
    {
        'code': SubscriptionPlan.CODE_BOUTIQUE,
        'name': 'Boutique',
        'description': 'Pour une boutique avec une petite équipe.',
        'price_amount': Decimal('19'),
        'price_yearly_amount': Decimal('190'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_MONTH,
        'max_products': None,
        'max_orders_per_month': None,
        'max_customers': None,
        'max_members': 4,
        'max_vision_scans_per_month': 100,
        'max_text_scans_per_month': 60,
        'features_json': _BOUTIQUE,
        'is_active': True,
    },
    {
        'code': SubscriptionPlan.CODE_COMMERCE_PLUS,
        'name': 'Commerce+',
        'description': 'Pour les commerces qui grandissent.',
        'price_amount': Decimal('39'),
        'price_yearly_amount': Decimal('390'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_MONTH,
        'max_products': None,
        'max_orders_per_month': None,
        'max_customers': None,
        'max_members': None,
        'max_vision_scans_per_month': 300,
        'max_text_scans_per_month': 130,
        'features_json': _COMMERCE_PLUS,
        'is_active': True,
    },
]


class Command(BaseCommand):
    help = 'Re-seed les 4 plans canoniques (free / solo / boutique / commerce_plus).'

    def handle(self, *args, **options):
        for data in PLANS:
            plan, created = SubscriptionPlan.objects.update_or_create(
                code=data['code'],
                defaults={k: v for k, v in data.items() if k != 'code'},
            )
            verb = 'créé' if created else 'mis à jour'
            self.stdout.write(f'  ✓ {plan.code:15} {plan.name:12} {plan.price_amount} {plan.currency} ({verb})')  # noqa: E501
        self.stdout.write(self.style.SUCCESS('Plans canoniques OK.'))
