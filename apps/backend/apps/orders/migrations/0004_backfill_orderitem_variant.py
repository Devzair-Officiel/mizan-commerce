from django.db import migrations


def backfill_variant(apps, schema_editor):
    OrderItem = apps.get_model('orders', 'OrderItem')
    ProductVariant = apps.get_model('products', 'ProductVariant')

    variant_by_product = {
        v.product_id: v
        for v in ProductVariant.objects.filter(packaging_name='Par défaut')
    }

    for item in OrderItem.objects.all().iterator():
        if item.product_id is None:
            continue
        variant = variant_by_product.get(item.product_id)
        if variant is None:
            continue
        item.variant_id = variant.id
        item.variant_name = variant.packaging_name
        item.save(update_fields=['variant', 'variant_name'])


def reverse_backfill(apps, schema_editor):
    OrderItem = apps.get_model('orders', 'OrderItem')
    OrderItem.objects.update(variant=None, variant_name='')


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0003_orderitem_add_variant'),
    ]

    operations = [
        migrations.RunPython(backfill_variant, reverse_backfill),
    ]
