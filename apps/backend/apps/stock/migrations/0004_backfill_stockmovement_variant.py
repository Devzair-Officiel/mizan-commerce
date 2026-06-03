from django.db import migrations


def backfill_variant(apps, schema_editor):
    StockMovement = apps.get_model('stock', 'StockMovement')
    ProductVariant = apps.get_model('products', 'ProductVariant')

    # Pour chaque mouvement, on pointe vers la variante "Par défaut" du produit.
    variant_by_product = {
        v.product_id: v.id
        for v in ProductVariant.objects.filter(packaging_name='Par défaut')
    }

    for movement in StockMovement.objects.all().iterator():
        variant_id = variant_by_product.get(movement.product_id)
        if variant_id is None:
            continue
        movement.variant_id = variant_id
        movement.save(update_fields=['variant'])


def reverse_backfill(apps, schema_editor):
    StockMovement = apps.get_model('stock', 'StockMovement')
    StockMovement.objects.update(variant=None)


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0003_stockmovement_add_variant'),
    ]

    operations = [
        migrations.RunPython(backfill_variant, reverse_backfill),
    ]
