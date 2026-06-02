from __future__ import annotations

from typing import Any

from .models import AuditLog


def log_action(
    *,
    shop_id: str,
    user: Any,
    action: str,
    model_name: str,
    obj_id: Any,
    obj_repr: str,
    changes: dict | None = None,
) -> AuditLog:
    """Crée une entrée AuditLog. Helper réutilisable par les services métier."""
    return AuditLog.objects.create(
        shop_id=shop_id,
        user=user,
        action=action,
        model_name=model_name,
        object_id=str(obj_id),
        object_repr=obj_repr,
        changes=changes or {},
    )
