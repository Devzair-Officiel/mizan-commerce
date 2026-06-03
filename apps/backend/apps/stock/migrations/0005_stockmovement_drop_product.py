import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0004_backfill_stockmovement_variant'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockmovement',
            name='variant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_movements',
                to='products.productvariant',
            ),
        ),
        migrations.RemoveIndex(
            model_name='stockmovement',
            name='stock_movem_shop_id_efee71_idx',
        ),
        migrations.RemoveField(
            model_name='stockmovement',
            name='product',
        ),
        migrations.AddIndex(
            model_name='stockmovement',
            index=models.Index(
                fields=['shop', 'variant', '-created_at'],
                name='stock_movem_shop_id_variant_idx',
            ),
        ),
    ]
