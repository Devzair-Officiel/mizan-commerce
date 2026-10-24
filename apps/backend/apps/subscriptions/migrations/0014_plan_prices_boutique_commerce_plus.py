"""Nouveaux prix avant l'ouverture : Boutique 16 / 160 €, Commerce+ 29 / 290 €.

Valeurs figées ici, comme dans `0004_rename_plans` et `0005_plan_yearly_price`.
Mise à jour par code de formule : rejouer la migration ne change rien. Le
retour arrière rétablit 19 / 190 € et 39 / 390 €. Les identifiants de prix
Stripe ne sont pas touchés : `stripe_sync_plans` crée les nouveaux prix et les
enregistre (docs/exploitation/deploiement.md, « Changement de prix »).
"""

from decimal import Decimal

from django.db import migrations

# code : (mensuel, annuel)
NEW_PRICES = {
    'boutique': (Decimal('16.00'), Decimal('160.00')),
    'commerce_plus': (Decimal('29.00'), Decimal('290.00')),
}
OLD_PRICES = {
    'boutique': (Decimal('19.00'), Decimal('190.00')),
    'commerce_plus': (Decimal('39.00'), Decimal('390.00')),
}


def _set_prices(apps, prices):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for code, (monthly, yearly) in prices.items():
        SubscriptionPlan.objects.filter(code=code).update(
            price_amount=monthly, price_yearly_amount=yearly,
        )


def forwards(apps, schema_editor):
    _set_prices(apps, NEW_PRICES)


def backwards(apps, schema_editor):
    _set_prices(apps, OLD_PRICES)


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0013_subscription_past_due_cancel_requested_at'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
