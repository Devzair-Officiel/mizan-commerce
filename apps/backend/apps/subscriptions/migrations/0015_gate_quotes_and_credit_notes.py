"""Devis et avoirs réservés à Solo et au-delà (URS-111, URS-112).

Les clés `quotes` et `credit_notes` rejoignent `features_json` des formules
Solo, Boutique et Commerce+, comme dans `FEATURE_MIN_PLAN`. Seule l'écriture est
gatée : les devis et avoirs existants restent lisibles en Découverte. Le retour
arrière retire les deux clés de toutes les formules.
"""

from django.db import migrations

FEATURES = ('quotes', 'credit_notes')
PLANS = ('solo', 'boutique', 'commerce_plus')


def forwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(code__in=PLANS):
        missing = [f for f in FEATURES if f not in plan.features_json]
        if missing:
            plan.features_json = [*plan.features_json, *missing]
            plan.save(update_fields=['features_json'])


def backwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.all():
        kept = [f for f in plan.features_json if f not in FEATURES]
        if kept != plan.features_json:
            plan.features_json = kept
            plan.save(update_fields=['features_json'])


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0014_plan_prices_boutique_commerce_plus'),
    ]

    operations = [
        migrations.RunPython(forwards, reverse_code=backwards),
    ]
