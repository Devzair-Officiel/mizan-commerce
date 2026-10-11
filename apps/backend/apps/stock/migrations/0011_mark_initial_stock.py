from datetime import timedelta

from django.db import migrations

# Un stock initial suit de près la création du format. Pas de borne basse : les
# données de démonstration antidatent leur stock initial.
INITIAL_DELAY = timedelta(minutes=1)


def mark_initial_stock(apps, schema_editor):
    """Marque le stock initial des formats existants : leur premier mouvement,
    s'il s'agit d'une entrée sans commande ni facture, enregistrée dans la
    minute qui suit la création du format."""
    StockMovement = apps.get_model('stock', 'StockMovement')
    first_seen: set = set()
    initial_ids = []
    movements = StockMovement.objects.select_related('variant').order_by(
        'variant_id', 'created_at', 'id',
    )
    for movement in movements.iterator():
        if movement.variant_id in first_seen:
            continue
        first_seen.add(movement.variant_id)
        if (
            movement.movement_type == 'in'
            and movement.order_id is None
            and not movement.supplier_name
            and not movement.invoice_number
            and movement.ocr_result_id is None
            and movement.created_at <= movement.variant.created_at + INITIAL_DELAY
        ):
            initial_ids.append(movement.pk)
    StockMovement.objects.filter(pk__in=initial_ids).update(is_initial=True)


def unmark_initial_stock(apps, schema_editor):
    StockMovement = apps.get_model('stock', 'StockMovement')
    StockMovement.objects.filter(is_initial=True).update(is_initial=False)


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0010_stockmovement_is_initial'),
    ]

    operations = [
        migrations.RunPython(mark_initial_stock, unmark_initial_stock),
    ]
