"""Contrôle avant la refonte (lot Z1) : un calcul par boutique et par année.

Chaque calcul existant sera rattaché au propriétaire de sa boutique, en année
grégorienne : deux calculs d'une même boutique la même année deviendraient deux
calculs d'une même personne la même année, ce que la nouvelle contrainte refuse.
Ce contrôle passe avant tout changement de schéma : s'il échoue, rien n'est
modifié ni supprimé, et le message liste les calculs à départager.
"""
from collections import defaultdict

from django.db import migrations


def check_one_calculation_per_year(apps, schema_editor):
    ZakatCalculation = apps.get_model('zakat', 'ZakatCalculation')
    ShopMember = apps.get_model('shops', 'ShopMember')

    owned_shops = set(ShopMember.objects.filter(role='owner').values_list('shop_id', flat=True))  # noqa: E501
    groups = defaultdict(list)
    orphans = []
    rows = ZakatCalculation.objects.order_by('shop_id', 'reference_date', 'created_at')
    for calc in rows.values('id', 'shop_id', 'reference_date', 'status', 'created_at'):
        if calc['shop_id'] not in owned_shops:
            orphans.append(calc)
        groups[(calc['shop_id'], calc['reference_date'].year)].append(calc)

    duplicates = [calcs for calcs in groups.values() if len(calcs) > 1]
    if not duplicates and not orphans:
        return
    lines = ['Migration zakat arrêtée, aucune donnée modifiée ni supprimée.']
    for calcs in duplicates:
        shop_id, year = calcs[0]['shop_id'], calcs[0]['reference_date'].year
        lines.append(f'Boutique {shop_id}, année {year} : {len(calcs)} calculs')
        lines.extend(
            f"  - {c['id']} (date {c['reference_date']}, {c['status']}, créé le {c['created_at']:%Y-%m-%d})"  # noqa: E501
            for c in calcs
        )
    for calc in orphans:
        lines.append(f"Boutique {calc['shop_id']} sans propriétaire : calcul {calc['id']}")
    raise RuntimeError('\n'.join(lines))


class Migration(migrations.Migration):

    dependencies = [
        ('shops', '0009_shop_invoice_auto_color_shop_invoice_bic_and_more'),
        ('zakat', '0006_zakatcalculation_unique_finalized_zakat_per_shop_year'),
    ]

    operations = [
        migrations.RunPython(check_one_calculation_per_year, migrations.RunPython.noop),
    ]
