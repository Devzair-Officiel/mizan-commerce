from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('zakat', '0009_copy_shop_settings_to_owner_profile'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='zakatcalculation',
            name='unique_finalized_zakat_per_shop_year',
        ),
        # Nullables le temps du rattrapage (0011), obligatoires ensuite (0012).
        migrations.AddField(
            model_name='zakatcalculation',
            name='user',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='zakat_calculations', to=settings.AUTH_USER_MODEL),  # noqa: E501
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='hawl_calendar',
            field=models.CharField(choices=[('hijri', 'Hégirien'), ('gregorian', 'Grégorien')], max_length=10, null=True),  # noqa: E501
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='hawl_year',
            field=models.PositiveSmallIntegerField(null=True),
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='version',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='stock_sale_value',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=12),  # noqa: E501
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='stock_purchase_value',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=12),  # noqa: E501
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='stock_extra',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=12),  # noqa: E501
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='receivable_items',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='other_assets',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='debt_items',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='zakatcalculation',
            name='choices_snapshot',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
