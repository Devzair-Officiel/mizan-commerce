"""Lectures avancées du scan d'emballage (URS-109) : structuration du texte
plafonnée par mois — Découverte 10, Solo 30, Boutique 60, Commerce+ 130.

Valeurs de départ figées ici, comme dans `0006_plan_vision_scans` ; elles
seront ajustées après les tests de coût (`seed_plans` les rafraîchit en dev).
Le retour arrière n'a rien à défaire : la colonne disparaît avec le RemoveField.
"""

from django.db import migrations, models

TEXT_SCANS_PER_MONTH = {
    'free': 10,
    'solo': 30,
    'boutique': 60,
    'commerce_plus': 130,
}


def forwards(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(code__in=TEXT_SCANS_PER_MONTH):
        plan.max_text_scans_per_month = TEXT_SCANS_PER_MONTH[plan.code]
        plan.save(update_fields=['max_text_scans_per_month'])


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0006_plan_vision_scans'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptionplan',
            name='max_text_scans_per_month',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(forwards, reverse_code=migrations.RunPython.noop),
    ]
