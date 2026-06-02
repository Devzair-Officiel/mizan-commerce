from __future__ import annotations

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver


def _log(shop_id, user, action: str, model_name: str, obj_id: str, obj_repr: str, changes: dict) -> None:
    from apps.core.models import AuditLog
    AuditLog.objects.create(
        shop_id=shop_id,
        user=user,
        action=action,
        model_name=model_name,
        object_id=str(obj_id),
        object_repr=obj_repr,
        changes=changes,
    )


# ── Stock movements ──────────────────────────────────────────────────────────

@receiver(post_save, sender='stock.StockMovement')
def log_stock_movement(sender, instance, created: bool, **kwargs) -> None:
    if not created:
        return
    action_map = {
        'entry': 'stock_entry',
        'exit': 'stock_exit',
        'adjustment': 'stock_adjustment',
    }
    action = action_map.get(instance.movement_type, 'stock_entry')
    _log(
        shop_id=instance.shop_id,
        user=instance.created_by if hasattr(instance, 'created_by') else None,
        action=action,
        model_name='StockMovement',
        obj_id=instance.pk,
        obj_repr=str(instance),
        changes={
            'product_id': str(instance.product_id),
            'quantity': str(instance.quantity),
            'reason': instance.reason,
        },
    )


# ── Deletions ─────────────────────────────────────────────────────────────────

@receiver(post_delete, sender='customers.Customer')
def log_customer_delete(sender, instance, **kwargs) -> None:
    _log(
        shop_id=instance.shop_id,
        user=None,
        action='customer_delete',
        model_name='Customer',
        obj_id=instance.pk,
        obj_repr=str(instance),
        changes={'name': instance.name},
    )


@receiver(post_delete, sender='products.Product')
def log_product_delete(sender, instance, **kwargs) -> None:
    _log(
        shop_id=instance.shop_id,
        user=None,
        action='product_delete',
        model_name='Product',
        obj_id=instance.pk,
        obj_repr=str(instance),
        changes={'name': instance.name},
    )
