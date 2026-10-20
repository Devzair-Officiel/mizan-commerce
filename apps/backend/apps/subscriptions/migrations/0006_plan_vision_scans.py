"""Scan d'emballage (URS-109, proposée) : ouvert à toutes les formules, secours
vision plafonné par mois — Découverte 5, Solo 30, Boutique 100, Commerce+ 300.

Valeurs de départ figées ici, comme dans `0005_plan_yearly_price` ; elles
seront ajustées après les tests de coût (`seed_plans` les rafraîchit en dev).
Le retour arrière retire `product_scan` des fonctionnalités ; la colonne
disparaît avec le RemoveField.
"""

from django.db import migrations, models

VISION_SCANS_PER_MONTH = {
    'free': 5,
    'solo': 30,
    'boutique': 100,
    'commerce_plus': 300,
}
FEATURE = 'product_scan'


def forwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(code__in=VISION_SCANS_PER_MONTH):
        plan.max_vision_scans_per_month = VISION_SCANS_PER_MONTH[plan.code]
        if FEATURE not in plan.features_json:
            plan.features_json = [*plan.features_json, FEATURE]
        plan.save(update_fields=['max_vision_scans_per_month', 'features_json'])


def backwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.all():
        if FEATURE in plan.features_json:
            plan.features_json = [f for f in plan.features_json if f != FEATURE]
            plan.save(update_fields=['features_json'])


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0005_plan_yearly_price'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptionplan',
            name='max_vision_scans_per_month',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(forwards, reverse_code=backwards),
    ]
