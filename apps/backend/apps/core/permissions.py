"""Helpers de permission et de scoping multi-tenant.

Tout endpoint authentifié de l'API DOIT scoper ses querysets à la boutique
du membre courant. Ce module centralise :

- `get_shop(user)` : récupère la boutique du user (ex-duplication dans 8 fichiers).
- `ShopScopedQuerysetMixin` : mixin DRF qui filtre automatiquement par `shop`
  et injecte la boutique dans le contexte du serializer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rest_framework.exceptions import PermissionDenied

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.shops.models import Shop


def get_shop(user: "User") -> "Shop":
    """Retourne la boutique associée à l'utilisateur courant.

    Lève `PermissionDenied` si aucun `ShopMember` n'est trouvé — ce qui se
    traduit en HTTP 403 côté DRF.
    """
    from apps.shops.models import ShopMember

    membership = (
        ShopMember.objects.filter(user=user).select_related("shop").first()
    )
    if not membership:
        raise PermissionDenied("Aucune boutique associée.")
    return membership.shop


def get_shop_from_request(request: Any) -> "Shop":
    """Variante explicite pour les vues qui passent l'objet request."""
    return get_shop(request.user)


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
