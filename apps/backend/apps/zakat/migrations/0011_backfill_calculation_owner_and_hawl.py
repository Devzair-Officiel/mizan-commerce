"""Rattache chaque calcul existant au propriétaire de sa boutique.

- Année du hawl : grégorienne (aucun calendrier n'est encore choisi), celle de la
  date de référence, comme l'ancienne contrainte « un finalisé par an ».
- Dettes : `debts_breakdown` → `debt_items`, exigible → part 12 mois = montant, sinon 0.
- Stock : l'ancienne estimation (prix d'achat) devient `stock_purchase_value`.
La 0007 a vérifié qu'aucune boutique n'a deux calculs la même année ni de calcul
sans propriétaire ; la vérification est refaite ici, sans rien supprimer.
"""
from django.db import migrations


def _debt_items(debts_breakdown):
    return [
        {
            'category': item.get('category', 'other'),
            'label': item.get('label', ''),
            'amount': str(item.get('amount', '0')),
            'amount_within_12_months': str(item.get('amount', '0')) if item.get('is_immediately_due') else '0',  # noqa: E501
        }
        for item in debts_breakdown or []
    ]


def backfill(apps, schema_editor):
    ZakatCalculation = apps.get_model('zakat', 'ZakatCalculation')
    ShopMember = apps.get_model('shops', 'ShopMember')

    owners = dict(ShopMember.objects.filter(role='owner').values_list('shop_id', 'user_id'))  # noqa: E501
    orphans = []
    for calc in ZakatCalculation.objects.filter(user__isnull=True).iterator():
        if calc.shop_id not in owners:
            orphans.append(str(calc.pk))
            continue
        calc.user_id = owners[calc.shop_id]
        calc.hawl_calendar = 'gregorian'
        calc.hawl_year = calc.reference_date.year
        calc.debt_items = _debt_items(calc.debts_breakdown)
        calc.stock_purchase_value = calc.stock_value_estimated
        calc.save(update_fields=[
            'user', 'hawl_calendar', 'hawl_year', 'debt_items', 'stock_purchase_value',
        ])
    if orphans:
        raise RuntimeError(
            'Migration zakat arrêtée, rien supprimé : calculs sans propriétaire de boutique : '  # noqa: E501
            + ', '.join(orphans),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('zakat', '0010_calculation_personal_fields'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
