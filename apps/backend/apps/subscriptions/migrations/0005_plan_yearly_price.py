"""Prix annuels des quatre formules (lot 7c) : 0 / 90 / 190 / 390 €.

Valeurs figées ici, comme dans `0004_rename_plans`. Le retour arrière n'a rien
à rétablir : les colonnes disparaissent avec le RemoveField.
"""

from decimal import Decimal

from django.db import migrations, models

YEARLY_PRICES = {
    'free': Decimal('0'),
    'solo': Decimal('90'),
    'boutique': Decimal('190'),
    'commerce_plus': Decimal('390'),
}


def forwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for code, price in YEARLY_PRICES.items():
        SubscriptionPlan.objects.filter(code=code).update(price_yearly_amount=price)


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0004_rename_plans'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptionplan',
            name='price_yearly_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=12),
        ),
        migrations.AddField(
            model_name='subscriptionplan',
            name='stripe_price_id_yearly',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.RunPython(forwards, reverse_code=migrations.RunPython.noop),
    ]
