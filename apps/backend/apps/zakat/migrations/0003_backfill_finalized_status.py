"""Marque les calculs historiques comme `finalized` (avant l'introduction du brouillon).

Toute ligne existante avant la 0002 avait été créée via l'ancien endpoint qui calculait
directement la zakat. Elles ne sont donc jamais en brouillon — on les passe en `finalized`
et on renseigne `finalized_at` avec `created_at`.
"""
from django.db import migrations


def backfill_finalized(apps, schema_editor):
    Zakat = apps.get_model('zakat', 'ZakatCalculation')
    Zakat.objects.filter(status='draft').update(
        status='finalized',
        current_step=5,
    )
    # finalized_at = created_at pour conserver une trace cohérente.
    for calc in Zakat.objects.filter(finalized_at__isnull=True):
        calc.finalized_at = calc.created_at
        calc.save(update_fields=['finalized_at'])


def reverse(apps, schema_editor):
    # Pas de rollback métier : on laisse les statuts en place.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('zakat', '0002_alter_zakatcalculation_options_and_more'),
    ]
    operations = [migrations.RunPython(backfill_finalized, reverse)]
