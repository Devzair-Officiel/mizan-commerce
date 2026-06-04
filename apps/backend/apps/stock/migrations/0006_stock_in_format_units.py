"""Bascule la sémantique des stocks : unités de contenu → nombre de formats.

Avant : une bouteille de 250 mL avec 50 unités physiques stockait `stock_quantity = 12500`
        et chaque mouvement enregistrait des mL.
Après : la même bouteille stocke `stock_quantity = 50` (= nombre de bouteilles),
        et les mouvements comptent des formats.

Pour les variantes avec `base_quantity = 1` (vrac, pièces unitaires), rien ne change :
division par 1. La migration est réversible (multiplication par base_quantity).
"""
from decimal import Decimal

from django.db import migrations

# Signes répliqués depuis apps.stock.models.MOVEMENT_SIGNS — on ne peut pas
# importer le code applicatif depuis une migration (modèles historiques).
_SIGNS = {
    'in': Decimal('1'),
    'release': Decimal('1'),
    'out': Decimal('-1'),
    'reservation': Decimal('-1'),
    'loss': Decimal('-1'),
}


def _recompute_variant_cache(StockMovement, variant) -> None:
    total = Decimal('0')
    for mov in StockMovement.objects.filter(variant=variant):
        if mov.movement_type == 'adjustment':
            total += Decimal(mov.quantity)
        else:
            total += _SIGNS[mov.movement_type] * abs(Decimal(mov.quantity))
    variant.stock_quantity = total
    variant.save(update_fields=['stock_quantity'])


def _rescale(apps, schema_editor, *, factor_op) -> None:
    ProductVariant = apps.get_model('products', 'ProductVariant')
    StockMovement = apps.get_model('stock', 'StockMovement')

    for variant in ProductVariant.objects.iterator():
        base_qty = Decimal(variant.base_quantity)
        if base_qty == Decimal('1'):
            continue
        for mov in StockMovement.objects.filter(variant=variant):
            mov.quantity = factor_op(Decimal(mov.quantity), base_qty).quantize(Decimal('0.001'))
            mov.save(update_fields=['quantity'])
        _recompute_variant_cache(StockMovement, variant)


def to_format_count(apps, schema_editor):
    _rescale(apps, schema_editor, factor_op=lambda q, b: q / b)


def to_content_units(apps, schema_editor):
    _rescale(apps, schema_editor, factor_op=lambda q, b: q * b)


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0008_remove_product_products_shop_id_e31cec_idx_and_more'),
        ('stock', '0005_stockmovement_drop_product'),
    ]

    operations = [
        migrations.RunPython(to_format_count, to_content_units),
    ]
