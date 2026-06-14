"""Seed des 3 plans canoniques (free / pro / boutique_plus).

On utilise une data migration plutôt qu'une management command pour garantir
que les plans existent dès que les tables sont créées. La logique de register
en dépend (start_trial_or_default lit SubscriptionPlan.objects.get(code='...')).

Le management command `seed_plans` (à venir) pourra re-seeder/mettre à jour en dev.
"""

from decimal import Decimal

from django.db import migrations

# Limites quantitatives Gratuit — URS-064.
# Pro/Boutique+ : illimité (NULL).
PLANS = [
    {
        'code': 'free',
        'name': 'Gratuit',
        'description': "L'essentiel pour bien commencer.",
        'price_amount': Decimal('0'),
        'currency': 'EUR',
        'billing_period': 'lifetime',
        'max_products': 50,
        'max_orders_per_month': 20,
        'features_json': ['products', 'stock', 'notes', 'reminders'],
        'is_active': True,
    },
    {
        'code': 'pro',
        'name': 'Pro',
        'description': 'Pour gérer tout votre commerce.',
        'price_amount': Decimal('9'),
        'currency': 'EUR',
        'billing_period': 'month',
        'max_products': None,
        'max_orders_per_month': None,
        'features_json': [
            'products', 'stock', 'notes', 'reminders',
            'orders', 'invoices', 'zakat', 'whatsapp',
        ],
        'is_active': True,
    },
    {
        'code': 'boutique_plus',
        'name': 'Boutique+',
        'description': 'Outils avancés et partenariats.',
        'price_amount': Decimal('19'),
        'currency': 'EUR',
        'billing_period': 'month',
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


def seed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for data in PLANS:
        SubscriptionPlan.objects.update_or_create(
            code=data['code'],
            defaults={k: v for k, v in data.items() if k != 'code'},
        )


def unseed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(code__in=[p['code'] for p in PLANS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_code=unseed_plans),
    ]
