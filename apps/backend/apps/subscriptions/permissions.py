"""Gating DRF par formule d'abonnement.

À ne pas confondre avec `core.permissions.HasModulePermission` :
- `HasModulePermission` gate par **membre** (qui dans la boutique a accès à
  ce module — RBAC interne).
- `HasPlanForFeature` gate par **souscription** (la boutique a-t-elle payé
  pour cette fonctionnalité — RBAC commercial).

Un endpoint sensible combine les deux : on vérifie d'abord que la boutique a la
formule qui débloque la feature, puis que le membre courant a le module activé.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from apps.core.permissions import get_shop

from .models import SubscriptionPlan

if TYPE_CHECKING:
    from apps.shops.models import Shop

# Mapping feature → plan minimum requis. Source de vérité du gating commercial ;
# `features_json` de chaque plan en est la projection (cohérence vérifiée par les
# tests). Toute feature absente de ce mapping est gatée fermée (fail-closed) : un
# endpoint mal câblé refuse l'accès plutôt que d'ouvrir un trou silencieux.
# Certaines clés n'ont pas encore de code (visual_inventory, qr_codes…) : elles
# sont déclarées pour que la grille soit complète, sans endpoint derrière.
FEATURE_MIN_PLAN: dict[str, str] = {
    # Découverte
    'products': SubscriptionPlan.CODE_FREE,
    'stock': SubscriptionPlan.CODE_FREE,
    'notes': SubscriptionPlan.CODE_FREE,
    'reminders': SubscriptionPlan.CODE_FREE,
    'orders': SubscriptionPlan.CODE_FREE,
    'zakat': SubscriptionPlan.CODE_FREE,
    # Scan d'emballage ouvert à tous ; seul son secours vision est plafonné
    # par formule (`max_vision_scans_per_month`).
    'product_scan': SubscriptionPlan.CODE_FREE,
    # Solo
    'invoices': SubscriptionPlan.CODE_SOLO,
    'whatsapp': SubscriptionPlan.CODE_SOLO,
    'zakat_history': SubscriptionPlan.CODE_SOLO,
    'auto_reminders': SubscriptionPlan.CODE_SOLO,
    # Boutique
    'multi_user': SubscriptionPlan.CODE_BOUTIQUE,
    'roles_permissions': SubscriptionPlan.CODE_BOUTIQUE,
    'invoice_branding': SubscriptionPlan.CODE_BOUTIQUE,
    'message_templates': SubscriptionPlan.CODE_BOUTIQUE,
    'daily_digest': SubscriptionPlan.CODE_BOUTIQUE,
    'sales_stats': SubscriptionPlan.CODE_BOUTIQUE,
    'exports': SubscriptionPlan.CODE_BOUTIQUE,
    'public_pages': SubscriptionPlan.CODE_BOUTIQUE,
    'loyalty': SubscriptionPlan.CODE_BOUTIQUE,
    'ocr': SubscriptionPlan.CODE_BOUTIQUE,
    'visual_inventory': SubscriptionPlan.CODE_BOUTIQUE,
    'qr_codes': SubscriptionPlan.CODE_BOUTIQUE,
    'partnerships': SubscriptionPlan.CODE_BOUTIQUE,
    # Commerce+
    'audit_log': SubscriptionPlan.CODE_COMMERCE_PLUS,
    'priority_support': SubscriptionPlan.CODE_COMMERCE_PLUS,
}


def _tier_index(code: str) -> int:
    """Retourne l'index du plan dans la hiérarchie. -1 si inconnu (fail-closed)."""
    try:
        return SubscriptionPlan.TIER_ORDER.index(code)
    except ValueError:
        return -1


def shop_has_feature(shop: Shop, feature: str) -> bool:
    """La formule effective de la boutique débloque-t-elle `feature` ?"""
    required_code = FEATURE_MIN_PLAN.get(feature)
    if required_code is None:
        # Feature non répertoriée → fail-closed.
        return False
    return shop.effective_plan.tier >= _tier_index(required_code)


class HasPlanForFeature(BasePermission):
    """Gate l'accès à un endpoint selon la formule souscrite par la boutique.

    Usage sur un ViewSet :

        permission_classes = (
            IsAuthenticated,
            HasPlanForFeature.for_feature('orders'),
        )

    Combinable avec `HasModulePermission` pour gater à la fois la formule et
    le rôle interne.
    """

    feature: str = ''
    message = "Cette fonctionnalité nécessite une formule supérieure."

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        try:
            shop = get_shop(request.user)
        except PermissionDenied:
            return False
        return shop_has_feature(shop, self.feature)

    @classmethod
    def for_feature(cls, feature: str) -> type['HasPlanForFeature']:
        return type(
            f'HasPlanForFeature_{feature}',
            (cls,),
            {'feature': feature},
        )
