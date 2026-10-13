"""Corrige les `line_total` restés faux après un changement de quantité.

Avant 50053b1, `update_item_quantity` enregistrait la quantité sans `line_total` :
la ligne et les totaux de la commande gardaient l'ancien montant. On recalcule
chaque ligne qui ne correspond pas à prix unitaire × quantité, puis les totaux
de sa commande. Sans effet si elle est relancée (plus aucune ligne à corriger).

Les factures émises à partir d'une commande corrigée sont figées : elles sont
listées, jamais modifiées.
"""

from decimal import Decimal

from django.db import migrations

CENT = Decimal('0.01')


def fix_stale_line_totals(apps, schema_editor) -> dict:
    # Service existant : il ne lit que `order.items` et les montants, compatible
    # avec le modèle historique.
    from apps.orders.services import recalculate_totals

    OrderItem = apps.get_model('orders', 'OrderItem')
    Order = apps.get_model('orders', 'Order')
    Invoice = apps.get_model('invoices', 'Invoice')

    fixed_order_ids = set()
    fixed_lines = 0
    for item in OrderItem.objects.only('id', 'order_id', 'unit_price', 'quantity', 'line_total').iterator():
        expected = (Decimal(item.unit_price) * item.quantity).quantize(CENT)
        if item.line_total == expected:
            continue
        OrderItem.objects.filter(pk=item.pk).update(line_total=expected)
        fixed_lines += 1
        fixed_order_ids.add(item.order_id)

    for order in Order.objects.filter(pk__in=fixed_order_ids):
        recalculate_totals(order)

    invoices = list(
        Invoice.objects.filter(order_id__in=fixed_order_ids)
        .order_by('shop_id', 'number')
        .values_list('number', 'status', 'order_id'),
    )
    print(f'\n  Lignes corrigées : {fixed_lines} ; commandes corrigées : {len(fixed_order_ids)}')
    if invoices:
        print(f'  Factures émises sur une commande corrigée (non modifiées) : {len(invoices)}')
        for number, status, order_id in invoices:
            print(f'    - {number} ({status}), commande {order_id}')
    return {'lines': fixed_lines, 'orders': len(fixed_order_ids), 'invoices': invoices}


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_order_status_constraint'),
        ('invoices', '0004_invoice_discount_amount_invoice_shipping_amount'),
    ]

    operations = [
        migrations.RunPython(fix_stale_line_totals, migrations.RunPython.noop),
    ]
