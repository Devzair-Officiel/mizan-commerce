"""Lot Z2a : plus de fiche figée. Toutes les fiches repassent en brouillon.

`current_step` change de sens (dernière étape validée de l'assistant, 0 à 6) : une
fiche finalisée a toutes ses saisies validées (6), les autres reprennent au début (0).
Retour arrière sans effet : la finalisation n'existe plus.
"""
from django.db import migrations

ALL_STEPS_VALIDATED = 6


def back_to_draft(apps, schema_editor):
    Calc = apps.get_model('zakat', 'ZakatCalculation')
    Calc.objects.exclude(status='finalized').update(current_step=0)
    Calc.objects.filter(status='finalized').update(status='draft', current_step=ALL_STEPS_VALIDATED)  # noqa: E501


class Migration(migrations.Migration):

    dependencies = [
        ('zakat', '0012_calculation_personal_constraints'),
    ]

    operations = [
        migrations.RunPython(back_to_draft, migrations.RunPython.noop),
    ]
