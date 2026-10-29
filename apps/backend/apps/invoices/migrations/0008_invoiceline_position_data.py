"""Rang des lignes existantes : `position` suit l'ordre de création par facture.

Les lignes émises jusqu'ici étaient triées par `created_at` ; le nouvel ordre
(`position`, `created_at`) doit les rendre dans le même ordre.
"""

from django.db import migrations

BATCH = 1000


def number_lines(apps, schema_editor) -> None:
    InvoiceLine = apps.get_model('invoices', 'InvoiceLine')
    lines = InvoiceLine.objects.order_by('invoice_id', 'created_at', 'id').only(
        'id', 'invoice_id', 'position'
    )
    batch = []
    current, rank = None, 0
    for line in lines.iterator(chunk_size=BATCH):
        if line.invoice_id != current:
            current, rank = line.invoice_id, 0
        line.position = rank
        rank += 1
        batch.append(line)
        if len(batch) >= BATCH:
            InvoiceLine.objects.bulk_update(batch, ['position'])
            batch = []
    if batch:
        InvoiceLine.objects.bulk_update(batch, ['position'])


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0007_draft_invoice_and_free_lines'),
    ]

    operations = [
        migrations.RunPython(number_lines, migrations.RunPython.noop),
    ]
