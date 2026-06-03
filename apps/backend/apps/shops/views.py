from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Shop, ShopMember
from .permissions import IsShopMember
from .serializers import ShopSerializer, ShopMemberSerializer, AdminShopSerializer
from .services import delete_shop_logo, upload_shop_logo


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


class ShopLogoView(APIView):
    """Upload (POST) ou suppression (DELETE) du logo de la boutique courante."""
    permission_classes = (IsAuthenticated, IsShopMember)
    parser_classes = (MultiPartParser,)

    def _get_shop(self) -> Shop:
        shop = get_user_shop(self.request.user)
        self.check_object_permissions(self.request, shop)
        return shop

    def post(self, request) -> Response:
        shop = self._get_shop()
        file = request.FILES.get('logo')
        if not file:
            return Response({'detail': 'Champ « logo » requis.'}, status=status.HTTP_400_BAD_REQUEST)
        upload_shop_logo(shop=shop, file=file)
        return Response(ShopSerializer(shop, context={'request': request}).data)

    def delete(self, request) -> Response:
        shop = self._get_shop()
        delete_shop_logo(shop)
        return Response(ShopSerializer(shop, context={'request': request}).data)


class AdminShopListView(generics.ListAPIView):
    """Liste toutes les boutiques avec leurs membres — réservé aux superadmins."""
    serializer_class = AdminShopSerializer
    permission_classes = (IsAdminUser,)

    def get_queryset(self):
        return Shop.objects.prefetch_related(
            'members', 'members__user'
        ).order_by('-created_at')
