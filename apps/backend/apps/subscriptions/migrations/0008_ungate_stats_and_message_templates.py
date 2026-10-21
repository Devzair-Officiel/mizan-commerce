"""Statistiques de ventes et modèles de messages sortent de la formule Boutique.

Décision produit du 2026-10-21 : les statistiques restent accessibles à toutes
les formules et la personnalisation des modèles de messages dès Solo (avec
WhatsApp), comme aujourd'hui. Les clés `sales_stats` et `message_templates`,
qui ne restreignaient aucune vue, disparaissent de `features_json`. Le retour
arrière les rend aux formules Boutique et Commerce+.
"""

from django.db import migrations

FEATURES = ('message_templates', 'sales_stats')
BACKWARDS_PLANS = ('boutique', 'commerce_plus')


def forwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.all():
        kept = [f for f in plan.features_json if f not in FEATURES]
        if kept != plan.features_json:
            plan.features_json = kept
            plan.save(update_fields=['features_json'])


def backwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(code__in=BACKWARDS_PLANS):
        missing = [f for f in FEATURES if f not in plan.features_json]
        if missing:
            plan.features_json = [*plan.features_json, *missing]
            plan.save(update_fields=['features_json'])


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0007_plan_text_scans'),
    ]

    operations = [
        migrations.RunPython(forwards, reverse_code=backwards),
    ]
