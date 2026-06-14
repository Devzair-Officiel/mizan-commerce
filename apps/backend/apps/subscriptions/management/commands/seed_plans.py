"""Re-seed des 3 plans canoniques.

La data migration `subscriptions.0002_seed_plans` pose les plans au bootstrap.
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

PLANS = [
    {
        'code': SubscriptionPlan.CODE_FREE,
        'name': 'Gratuit',
        'description': "L'essentiel pour bien commencer.",
        'price_amount': Decimal('0'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_LIFETIME,
        'max_products': 50,
        'max_orders_per_month': 20,
        'features_json': ['products', 'stock', 'notes', 'reminders'],
        'is_active': True,
    },
    {
        'code': SubscriptionPlan.CODE_PRO,
        'name': 'Pro',
        'description': 'Pour gérer tout votre commerce.',
        'price_amount': Decimal('9'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_MONTH,
        'max_products': None,
        'max_orders_per_month': None,
        'features_json': [
            'products', 'stock', 'notes', 'reminders',
            'orders', 'invoices', 'zakat', 'whatsapp',
        ],
        'is_active': True,
    },
    {
        'code': SubscriptionPlan.CODE_BOUTIQUE_PLUS,
        'name': 'Boutique+',
        'description': 'Outils avancés et partenariats.',
        'price_amount': Decimal('19'),
        'currency': 'EUR',
        'billing_period': SubscriptionPlan.PERIOD_MONTH,
        'max_products': None,
        'max_orders_per_month': None,
        'features_json': [
            'products', 'stock', 'notes', 'reminders',
            'orders', 'invoices', 'zakat', 'whatsapp',
            'public_pages', 'partnerships', 'multi_user', 'exports', 'ocr',
        ],
        'is_active': True,
    },
]


class Command(BaseCommand):
    help = 'Re-seed les 3 plans canoniques (free / pro / boutique_plus).'

    def handle(self, *args, **options):
        for data in PLANS:
            plan, created = SubscriptionPlan.objects.update_or_create(
                code=data['code'],
                defaults={k: v for k, v in data.items() if k != 'code'},
            )
            verb = 'créé' if created else 'mis à jour'
            self.stdout.write(f'  ✓ {plan.code:15} {plan.name:12} {plan.price_amount} {plan.currency} ({verb})')
        self.stdout.write(self.style.SUCCESS('Plans canoniques OK.'))
