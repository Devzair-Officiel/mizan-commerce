"""Lot Z4 : chaque ligne de créance et de dette reçoit un `id` stable et une portée.

L'`id` relie une créance à son suivi à l'encaissement. Portée : `shop` pour une
commande ; ailleurs `null`, la personne n'a jamais choisi (vaut « boutique » à
100 %, à préciser sous 100 %). Une ligne qui a déjà un `id` ou une portée valide
la garde. Retour arrière sans effet : les clés en plus sont ignorées.
"""
import uuid

from django.db import migrations

LISTS = ('receivable_items', 'debt_items')


def _completed(items: list[dict]) -> tuple[list[dict], bool]:
    changed = False
    result = []
    for item in items or []:
        line = dict(item)
        if not line.get('id'):
            line['id'] = str(uuid.uuid4())
            changed = True
        scope = 'shop' if line.get('order_id') else line.get('scope')
        if scope not in ('shop', 'personal'):
            scope = None
        if 'scope' not in line or line['scope'] != scope:
            line['scope'] = scope
            changed = True
        result.append(line)
    return result, changed


def add_ids_and_scope(apps, schema_editor):
    Calc = apps.get_model('zakat', 'ZakatCalculation')
    for calc in Calc.objects.only('pk', *LISTS).iterator():
        fields = {}
        for name in LISTS:
            items, changed = _completed(getattr(calc, name))
            if changed:
                fields[name] = items
        if fields:
            Calc.objects.filter(pk=calc.pk).update(**fields)


class Migration(migrations.Migration):

    dependencies = [
        ('zakat', '0016_followups_and_payment'),
    ]

    operations = [
        migrations.RunPython(add_ids_and_scope, migrations.RunPython.noop),
    ]
