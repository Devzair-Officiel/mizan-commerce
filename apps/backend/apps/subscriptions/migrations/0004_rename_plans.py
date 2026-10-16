"""Grille 2026 : quatre formules (lot 7b).

Les codes sont renommés **en place** (mêmes PK) : les souscriptions pointent
toujours sur la même ligne, aucune FK n'est réécrite.

    free           → free           Découverte   0 €
    pro            → solo           Solo         9 €
    boutique_plus  → boutique       Boutique    19 €  (essai 14 j à l'inscription)
    (nouveau)      → commerce_plus  Commerce+   39 €

Les valeurs sont figées ici (pas d'import du code applicatif) : une migration
doit rejouer à l'identique même si `seed_plans` évolue ensuite.
"""

from decimal import Decimal

from django.db import migrations

RENAMES = (('pro', 'solo'), ('boutique_plus', 'boutique'))

FREE_FEATURES = ['products', 'stock', 'notes', 'reminders', 'orders', 'zakat']
SOLO_FEATURES = FREE_FEATURES + ['invoices', 'whatsapp', 'zakat_history', 'auto_reminders']
BOUTIQUE_FEATURES = SOLO_FEATURES + [
    'multi_user', 'roles_permissions', 'invoice_branding', 'message_templates',
    'daily_digest', 'sales_stats', 'exports', 'public_pages', 'loyalty', 'ocr',
    'visual_inventory', 'qr_codes', 'partnerships',
]
COMMERCE_PLUS_FEATURES = BOUTIQUE_FEATURES + ['audit_log', 'priority_support']

PLANS = [
    {
        'code': 'free',
        'name': 'Découverte',
        'description': "L'essentiel pour démarrer, sans engagement.",
        'price_amount': Decimal('0'),
        'billing_period': 'lifetime',
        'max_products': 30,
        'max_orders_per_month': 15,
        'max_customers': 15,
        'max_members': 1,
        'features_json': FREE_FEATURES,
    },
    {
        'code': 'solo',
        'name': 'Solo',
        'description': 'Pour le commerçant qui gère seul sa boutique.',
        'price_amount': Decimal('9'),
        'billing_period': 'month',
        'max_products': None,
        'max_orders_per_month': None,
        'max_customers': None,
        'max_members': 1,
        'features_json': SOLO_FEATURES,
    },
    {
        'code': 'boutique',
        'name': 'Boutique',
        'description': 'Pour une boutique avec une petite équipe.',
        'price_amount': Decimal('19'),
        'billing_period': 'month',
        'max_products': None,
        'max_orders_per_month': None,
        'max_customers': None,
        'max_members': 4,
        'features_json': BOUTIQUE_FEATURES,
    },
    {
        'code': 'commerce_plus',
        'name': 'Commerce+',
        'description': 'Pour les commerces qui grandissent.',
        'price_amount': Decimal('39'),
        'billing_period': 'month',
        'max_products': None,
        'max_orders_per_month': None,
        'max_customers': None,
        'max_members': None,
        'features_json': COMMERCE_PLUS_FEATURES,
    },
]

# État de `0002_seed_plans`, rétabli au retour arrière.
LEGACY_PLANS = [
    {
        'code': 'free',
        'name': 'Gratuit',
        'description': "L'essentiel pour bien commencer.",
        'max_products': 50,
        'max_orders_per_month': 20,
        'features_json': ['products', 'stock', 'notes', 'reminders'],
    },
    {
        'code': 'pro',
        'name': 'Pro',
        'description': 'Pour gérer tout votre commerce.',
        'max_products': None,
        'max_orders_per_month': None,
        'features_json': [
            'products', 'stock', 'notes', 'reminders',
            'orders', 'invoices', 'zakat', 'whatsapp',
        ],
    },
    {
        'code': 'boutique_plus',
        'name': 'Boutique+',
        'description': 'Outils avancés et partenariats.',
        'max_products': None,
        'max_orders_per_month': None,
        'features_json': [
            'products', 'stock', 'notes', 'reminders',
            'orders', 'invoices', 'zakat', 'whatsapp',
            'public_pages', 'partnerships', 'multi_user', 'exports', 'ocr',
        ],
    },
]


def forwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for old, new in RENAMES:
        if not SubscriptionPlan.objects.filter(code=new).exists():
            SubscriptionPlan.objects.filter(code=old).update(code=new)
    for data in PLANS:
        SubscriptionPlan.objects.update_or_create(
            code=data['code'],
            defaults={
                **{k: v for k, v in data.items() if k != 'code'},
                'currency': 'EUR',
                'is_active': True,
            },
        )


def backwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    Subscription = apps.get_model('subscriptions', 'Subscription')
    # Commerce+ n'existait pas : ses souscriptions reviennent sur Boutique.
    commerce_plus = SubscriptionPlan.objects.filter(code='commerce_plus').first()
    if commerce_plus is not None:
        boutique = SubscriptionPlan.objects.get(code='boutique')
        Subscription.objects.filter(plan=commerce_plus).update(plan=boutique)
        commerce_plus.delete()
    for old, new in RENAMES:
        SubscriptionPlan.objects.filter(code=new).update(code=old)
    for data in LEGACY_PLANS:
        SubscriptionPlan.objects.filter(code=data['code']).update(
            **{k: v for k, v in data.items() if k != 'code'},
            max_customers=None,
            max_members=None,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0003_plan_customer_member_limits'),
    ]

    operations = [
        migrations.RunPython(forwards, reverse_code=backwards),
    ]
