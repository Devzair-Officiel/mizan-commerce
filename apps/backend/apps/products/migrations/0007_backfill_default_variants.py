from django.db import migrations


def create_default_variants(apps, schema_editor):
    Product = apps.get_model('products', 'Product')
    ProductVariant = apps.get_model('products', 'ProductVariant')

    for product in Product.objects.all().iterator():
        # Une variante "Par défaut" par produit existant, hérite des champs actuels.
        ProductVariant.objects.create(
            shop_id=product.shop_id,
            product=product,
            packaging_name='Par défaut',
            unit=product.unit,
            base_quantity=1,
            selling_price=product.selling_price,
            purchase_price=product.purchase_price,
            stock_quantity=product.stock_quantity,
            low_stock_threshold=product.low_stock_threshold,
            sku=product.reference or '',
            position=0,
            is_active=True,
        )


def delete_default_variants(apps, schema_editor):
    ProductVariant = apps.get_model('products', 'ProductVariant')
    ProductVariant.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0006_productvariant'),
    ]

    operations = [
        migrations.RunPython(create_default_variants, delete_default_variants),
    ]
