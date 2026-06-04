"""Convertit `low_stock_threshold` en sémantique formats.

Suite à `stock/0006_stock_in_format_units` qui a basculé `stock_quantity` en
nombre de formats, les seuils d'alerte (qui étaient en unités de contenu)
doivent être divisés par `base_quantity` pour rester comparables.
Pour `base_quantity = 1`, aucun changement.
"""
from decimal import Decimal

from django.db import migrations


def to_format_count(apps, schema_editor):
    ProductVariant = apps.get_model('products', 'ProductVariant')
    for v in ProductVariant.objects.exclude(low_stock_threshold__isnull=True).iterator():
        base_qty = Decimal(v.base_quantity)
        if base_qty == Decimal('1'):
            continue
        v.low_stock_threshold = (Decimal(v.low_stock_threshold) / base_qty).quantize(Decimal('0.001'))
        v.save(update_fields=['low_stock_threshold'])


def to_content_units(apps, schema_editor):
    ProductVariant = apps.get_model('products', 'ProductVariant')
    for v in ProductVariant.objects.exclude(low_stock_threshold__isnull=True).iterator():
        base_qty = Decimal(v.base_quantity)
        if base_qty == Decimal('1'):
            continue
        v.low_stock_threshold = (Decimal(v.low_stock_threshold) * base_qty).quantize(Decimal('0.001'))
        v.save(update_fields=['low_stock_threshold'])


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0009_alter_productvariant_base_quantity_and_more'),
        ('stock', '0006_stock_in_format_units'),
    ]

    operations = [
        migrations.RunPython(to_format_count, to_content_units),
    ]
