import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0007_backfill_default_variants'),
        ('orders', '0002_drop_notes_field'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='variant',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='order_items',
                to='products.productvariant',
            ),
        ),
        migrations.AddField(
            model_name='orderitem',
            name='variant_name',
            field=models.CharField(max_length=120, blank=True, default=''),
            preserve_default=False,
        ),
    ]
