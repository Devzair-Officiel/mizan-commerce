from __future__ import annotations

import uuid
from typing import Any, Final

from .models import AuditLog

# `AuditLog.shop_id` est obligatoire. Une action qui ne concerne aucune boutique
# (compte de l'équipe Mizan, sans adhésion) est tracée sous cet identifiant nul :
# aucune boutique ne le porte, aucun écran commerçant ne le lit.
NO_SHOP_ID: Final = uuid.UUID(int=0)


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
