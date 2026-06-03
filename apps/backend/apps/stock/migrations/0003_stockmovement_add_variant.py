import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0007_backfill_default_variants'),
        ('stock', '0002_alter_stockmovement_quantity'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockmovement',
            name='variant',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_movements',
                to='products.productvariant',
            ),
        ),
    ]
