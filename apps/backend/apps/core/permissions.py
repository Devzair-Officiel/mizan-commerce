"""Helpers de permission et de scoping multi-tenant.

Tout endpoint authentifié de l'API DOIT scoper ses querysets à la boutique
du membre courant. Ce module centralise :

- `get_shop(user)` : récupère la boutique du user (ex-duplication dans 8 fichiers).
- `get_member(user)` : récupère le `ShopMember` complet (shop + role + permissions).
- `ShopScopedQuerysetMixin` : mixin DRF qui filtre automatiquement par `shop`
  et injecte la boutique dans le contexte du serializer.
- `IsShopAdmin` / `HasModulePermission` : permissions DRF basées sur le rôle
  et les modules accordés au membre.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.shops.models import Shop, ShopMember


# Modules toggleable par un admin pour un staff.
# Les modules absents de cette liste sont *toujours* admin-only
# (settings, zakat, team) et ne sont pas accordables à un staff.
MODULE_PRODUCTS = "products"
MODULE_ORDERS = "orders"
MODULE_CUSTOMERS = "customers"
MODULE_PAYMENTS = "payments"
MODULE_INVOICES = "invoices"
MODULE_STOCK = "stock"
MODULE_MESSAGES = "messages"
MODULE_DASHBOARD = "dashboard"

TOGGLEABLE_MODULES: tuple[str, ...] = (
    MODULE_PRODUCTS,
    MODULE_ORDERS,
    MODULE_CUSTOMERS,
    MODULE_PAYMENTS,
    MODULE_INVOICES,
    MODULE_STOCK,
    MODULE_MESSAGES,
    MODULE_DASHBOARD,
)


def get_member(user: "User") -> "ShopMember":
    """Retourne le `ShopMember` associé à l'utilisateur courant.

    Lève `PermissionDenied` si aucun `ShopMember` n'est trouvé.
    """
    from apps.shops.models import ShopMember

    membership = (
        ShopMember.objects.filter(user=user).select_related("shop").first()
    )
    if not membership:
        raise PermissionDenied("Aucune boutique associée.")
    return membership


def get_shop(user: "User") -> "Shop":
    """Retourne la boutique associée à l'utilisateur courant."""
    return get_member(user).shop


def get_shop_from_request(request: Any) -> "Shop":
    """Variante explicite pour les vues qui passent l'objet request."""
    return get_shop(request.user)


class IsShopAdmin(BasePermission):
    """Autorise uniquement les membres `owner` ou `admin` de la boutique."""

    message = "Accès réservé aux administrateurs de la boutique."

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        try:
            return get_member(request.user).is_admin
        except PermissionDenied:
            return False


class HasModulePermission(BasePermission):
    """Vérifie qu'un membre a accès à un module donné.

    À utiliser via `HasModulePermission.for_module('products')` sur une vue :

        permission_classes = (IsAuthenticated, HasModulePermission.for_module('products'))
    """

    module: str = ""
    message = "Module non accordé à votre compte."

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        try:
            member = get_member(request.user)
        except PermissionDenied:
            return False
        return member.has_module(self.module)

    @classmethod
    def for_module(cls, module: str) -> type["HasModulePermission"]:
        return type(
            f"HasModule_{module}",
            (cls,),
            {"module": module},
        )


class ShopScopedQuerysetMixin:
    """Filtre automatiquement le queryset par la boutique du user courant.

    À utiliser dans toute `generics.*` ou `ViewSet` DRF dont le modèle a un
    champ `shop`. Le serializer reçoit la boutique via le contexte sous la
    clé `shop` pour éviter les requêtes `ShopMember` redondantes (validations).

    Exemple :

        class ProductListCreateView(ShopScopedQuerysetMixin, generics.ListCreateAPIView):
            queryset = Product.objects.all()
            serializer_class = ProductSerializer
    """

    shop_lookup: str = "shop"

    def get_shop(self) -> "Shop":
        return get_shop(self.request.user)  # type: ignore[attr-defined]

    def get_queryset(self) -> "QuerySet[Any]":
        qs = super().get_queryset()  # type: ignore[misc]
        return qs.filter(**{self.shop_lookup: self.get_shop()})

    def get_serializer_context(self) -> dict[str, Any]:
        ctx = super().get_serializer_context()  # type: ignore[misc]
        ctx.setdefault("shop", self.get_shop())
        return ctx

    def perform_create(self, serializer: Any) -> None:
        serializer.save(shop=self.get_shop())
