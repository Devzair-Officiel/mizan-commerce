from rest_framework import generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated, IsAdminUser

from .models import Shop, ShopMember
from .permissions import IsShopMember
from .serializers import ShopSerializer, ShopMemberSerializer, AdminShopSerializer


def get_user_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class ShopDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ShopSerializer
    permission_classes = (IsAuthenticated, IsShopMember)

    def get_object(self):
        shop = get_user_shop(self.request.user)
        self.check_object_permissions(self.request, shop)
        return shop


class ShopMemberListView(generics.ListAPIView):
    serializer_class = ShopMemberSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        shop = get_user_shop(self.request.user)
        return ShopMember.objects.filter(shop=shop).select_related('user').order_by('created_at')


class AdminShopListView(generics.ListAPIView):
    """Liste toutes les boutiques avec leurs membres — réservé aux superadmins."""
    serializer_class = AdminShopSerializer
    permission_classes = (IsAdminUser,)

    def get_queryset(self):
        return Shop.objects.prefetch_related(
            'members', 'members__user'
        ).order_by('-created_at')
