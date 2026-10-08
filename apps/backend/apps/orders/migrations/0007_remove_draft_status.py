from django.db import migrations, models


def convert_drafts_to_to_prepare(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    OrderItem = apps.get_model('orders', 'OrderItem')
    StockMovement = apps.get_model('stock', 'StockMovement')
    ProductVariant = apps.get_model('products', 'ProductVariant')
    Product = apps.get_model('products', 'Product')

    draft_pks = list(Order.objects.filter(status='draft').values_list('pk', flat=True))
    count = len(draft_pks)

    for pk in draft_pks:
        order = Order.objects.get(pk=pk)
        items = OrderItem.objects.filter(order_id=pk)
        for item in items:
            if not item.variant_id:
                continue
            variant = ProductVariant.objects.filter(pk=item.variant_id).first()
            if not variant or not variant.product_id:
                continue
            product = Product.objects.filter(pk=variant.product_id).first()
            if product and product.type == 'product':
                StockMovement.objects.create(
                    shop_id=order.shop_id,
                    variant=variant,
                    movement_type='reservation',
                    quantity=item.quantity,
                    reason=f'Migration brouillon → à préparer — {order.order_number}',
                    order_id=pk,
                    created_by=None,
                )
        Order.objects.filter(pk=pk).update(status='to_prepare', stock_reserved=True)

    if count:
        print(f'\n    → {count} brouillon(s) convertis en à préparer')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0006_order_updated_by'),
        ('stock', '0007_rename_stock_movem_shop_id_variant_idx_stock_movem_shop_id_250df9_idx'),
    ]

    operations = [
        migrations.RunPython(convert_drafts_to_to_prepare, noop),
        migrations.AlterField(
            model_name='order',
            name='status',
            field=models.CharField(
                choices=[
                    ('to_prepare', 'À préparer'),
                    ('prepared', 'Préparé'),
                    ('shipped', 'Expédié'),
                    ('cancelled', 'Annulé'),
                ],
                default='to_prepare',
                max_length=20,
            ),
        ),
    ]
