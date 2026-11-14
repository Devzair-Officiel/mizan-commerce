"""Compteurs par type de document : `InvoiceSequence` devient `DocumentSequence`.

La table est transformée sur place (aucune copie) : les compteurs existants
prennent `kind='invoice'` et gardent leur `last_number`, le prochain numéro de
facture ne change pas.

Retour arrière : Django inverse les opérations dans l'ordre contraire. La
suppression des compteurs `kind ≠ 'invoice'` (devis, avoirs) vient donc en
dernier ici pour s'exécuter en premier au retour, avant que le `OneToOne`
n'impose un seul compteur par boutique. Ces compteurs sont perdus : retour
arrière acceptable avant la mise en production seulement.
"""

import django.db.models.deletion
from django.db import migrations, models


def drop_other_sequences(apps, schema_editor) -> None:
    DocumentSequence = apps.get_model('invoices', 'DocumentSequence')
    DocumentSequence.objects.exclude(kind='invoice').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('invoices', '0008_invoiceline_position_data'),
    ]

    operations = [
        migrations.RenameModel('InvoiceSequence', 'DocumentSequence'),
        migrations.AlterModelTable('documentsequence', 'document_sequences'),
        migrations.AddField(
            model_name='documentsequence',
            name='kind',
            field=models.CharField(
                choices=[
                    ('invoice', 'Facture'),
                    ('quote', 'Devis'),
                    ('credit_note', 'Avoir'),
                ],
                default='invoice',
                max_length=12,
            ),
        ),
        migrations.AlterField(
            model_name='documentsequence',
            name='shop',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='document_sequences',
                to='shops.shop',
            ),
        ),
        migrations.AddConstraint(
            model_name='documentsequence',
            constraint=models.UniqueConstraint(
                fields=('shop', 'kind'), name='unique_document_sequence_per_shop_kind'
            ),
        ),
        migrations.RunPython(migrations.RunPython.noop, drop_other_sequences),
    ]
