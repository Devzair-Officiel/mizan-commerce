"""Lot Z3 : retrait des champs de l'ancien écran de calcul.

Statut et date de finalisation, ventilations (créances, stock, dettes), éléments exclus,
résultat figé (`zakat_base`, `zakat_rate`, `zakat_amount`), copie du seuil
(`nisab_*`), `pdf_object_key` et `notes`. Le résultat vient de `compute_totals`, le
seuil de `choices_snapshot`, les dettes de `debt_items` (recopiées par la 0011).

Retour arrière : les colonnes sont recréées avec leurs valeurs par défaut (`draft`, 0,
listes vides, chaînes vides ou NULL) ; aucune donnée n'est restaurée.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('zakat', '0014_profile_hawl_reminder'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='zakatcalculation',
            name='zakat_calcu_shop_id_242881_idx',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='debts_breakdown',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='excluded_items_acknowledged',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='finalized_at',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='has_receivables',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='nisab_method',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='nisab_threshold',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='nisab_unit_price',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='notes',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='pdf_object_key',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='receivables_amount',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='receivables_breakdown',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='receivables_nominal',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='short_term_debts',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='status',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='stock_breakdown',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='stock_value_adjusted',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='stock_value_estimated',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='zakat_amount',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='zakat_base',
        ),
        migrations.RemoveField(
            model_name='zakatcalculation',
            name='zakat_rate',
        ),
    ]
