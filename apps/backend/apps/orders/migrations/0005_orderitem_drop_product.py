from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_backfill_orderitem_variant'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='orderitem',
            name='product',
        ),
    ]
