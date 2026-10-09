from __future__ import annotations

from decimal import Decimal

from apps.products.models import ProductVariant

from .models import MOVEMENT_SIGNS, StockMovement

__all__ = ['create_movement']

VALID_TYPES: frozenset[str] = frozenset(MOVEMENT_SIGNS.keys())


def create_movement(
    shop,
    variant: ProductVariant,
    movement_type: str,
    quantity: Decimal | int,
    reason: str = '',
    order_id=None,
    created_by=None,
) -> StockMovement:
    """
    Point d'entrée unique pour créer un mouvement de stock.

    Pré-conditions vérifiées :
    - type de mouvement valide
    - quantité > 0 (sauf pour 'adjustment' où elle est signée)
    - variante de la même boutique
    - variante liée à un article (pas un service)
    """
    if movement_type not in VALID_TYPES:
        raise ValueError(f"Type de mouvement invalide : {movement_type!r}.")

    qty = Decimal(str(quantity))
    if movement_type != 'adjustment' and qty <= 0:
        raise ValueError("La quantité doit être strictement positive.")

    if str(variant.shop_id) != str(shop.id):
        raise ValueError("La variante n'appartient pas à cette boutique.")

    if variant.product.type != 'product':
        raise ValueError(
            "Les mouvements de stock ne s'appliquent qu'aux articles."
        )

    return StockMovement.objects.create(
        shop=shop,
        variant=variant,
        movement_type=movement_type,
        quantity=qty,
        reason=reason,
        order_id=order_id,
        created_by=created_by,
    )
