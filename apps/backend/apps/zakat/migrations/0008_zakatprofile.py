import uuid
from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shops', '0009_shop_invoice_auto_color_shop_invoice_bic_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('zakat', '0007_check_one_calculation_per_year'),
    ]

    operations = [
        migrations.CreateModel(
            name='ZakatProfile',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),  # noqa: E501
                ('hawl_date', models.DateField(blank=True, null=True)),
                ('calendar', models.CharField(blank=True, choices=[('hijri', 'Hégirien'), ('gregorian', 'Grégorien')], max_length=10, null=True)),  # noqa: E501
                ('nisab_method', models.CharField(blank=True, choices=[('gold', 'Or (85 g)'), ('silver', 'Argent (595 g)')], max_length=8, null=True)),  # noqa: E501
                ('nisab_unit_price', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),  # noqa: E501
                ('nisab_price_updated_at', models.DateTimeField(blank=True, null=True)),
                ('stock_valuation', models.CharField(blank=True, choices=[('sale', 'Prix de vente'), ('purchase', "Prix d'achat")], max_length=10, null=True)),  # noqa: E501
                ('receivables_mode', models.CharField(blank=True, choices=[('yearly', 'Comptées chaque année'), ('on_collection', "Versées à l'encaissement")], max_length=16, null=True)),  # noqa: E501
                ('debts_mode', models.CharField(blank=True, choices=[('all', 'Toutes les dettes'), ('within_12_months', 'Part due dans les 12 mois'), ('none', 'Aucune')], max_length=20, null=True)),  # noqa: E501
                ('ownership_share', models.DecimalField(decimal_places=2, default=Decimal('100'), max_digits=5)),  # noqa: E501
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('shop', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='zakat_profiles', to='shops.shop')),  # noqa: E501
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='zakat_profiles', to=settings.AUTH_USER_MODEL)),  # noqa: E501
            ],
            options={
                'db_table': 'zakat_profiles',
                'constraints': [
                    models.UniqueConstraint(fields=('shop', 'user'), name='unique_zakat_profile_per_member'),  # noqa: E501
                    models.CheckConstraint(condition=models.Q(('ownership_share__gt', 0), ('ownership_share__lte', 100)), name='zakat_profile_ownership_share_range'),  # noqa: E501
                    models.CheckConstraint(condition=models.Q(('nisab_unit_price__isnull', True), ('nisab_unit_price__gt', 0), _connector='OR'), name='zakat_profile_nisab_unit_price_positive'),  # noqa: E501
                ],
            },
        ),
    ]
