from rest_framework.permissions import BasePermission

from .models import ShopMember


class IsShopMember(BasePermission):
    """Vérifie que l'utilisateur est membre de la boutique ciblée."""

    def has_object_permission(self, request, view, obj):
        return ShopMember.objects.filter(shop=obj, user=request.user).exists()


class IsShopOwner(BasePermission):
    """Vérifie que l'utilisateur est owner de la boutique ciblée."""

    def has_object_permission(self, request, view, obj):
        return ShopMember.objects.filter(shop=obj, user=request.user, role='owner').exists()
