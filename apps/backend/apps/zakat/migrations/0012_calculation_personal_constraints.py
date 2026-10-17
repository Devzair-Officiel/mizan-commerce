import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('zakat', '0011_backfill_calculation_owner_and_hawl'),
    ]

    operations = [
        migrations.AlterField(
            model_name='zakatcalculation',
            name='user',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='zakat_calculations', to=settings.AUTH_USER_MODEL),  # noqa: E501
        ),
        migrations.AlterField(
            model_name='zakatcalculation',
            name='hawl_calendar',
            field=models.CharField(choices=[('hijri', 'Hégirien'), ('gregorian', 'Grégorien')], max_length=10),  # noqa: E501
        ),
        migrations.AlterField(
            model_name='zakatcalculation',
            name='hawl_year',
            field=models.PositiveSmallIntegerField(),
        ),
        migrations.AddIndex(
            model_name='zakatcalculation',
            index=models.Index(fields=['shop', 'user'], name='zakat_calcu_shop_id_c1ddd7_idx'),  # noqa: E501
        ),
        migrations.AddConstraint(
            model_name='zakatcalculation',
            constraint=models.UniqueConstraint(fields=('shop', 'user', 'hawl_calendar', 'hawl_year'), name='unique_zakat_per_person_hawl_year'),  # noqa: E501
        ),
    ]
