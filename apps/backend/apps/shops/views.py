from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin

from .models import Shop, ShopMember
from .permissions import IsShopMember
from .serializers import (
    AdminShopSerializer,
    OnboardingSerializer,
    ShopMemberCreateSerializer,
    ShopMemberSerializer,
    ShopMemberUpdateSerializer,
    ShopSerializer,
)
from .services import (
    create_staff_member,
    delete_shop_logo,
    remove_member,
    update_member_permissions,
    upload_shop_logo,
)


def get_user_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class ShopDetailView(generics.RetrieveUpdateAPIView):
    """GET ouvert à tous les membres (lecture devise / nom / …).
    PATCH/PUT réservés aux admins (réglages boutique)."""

    serializer_class = ShopSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsShopMember()]
        return [IsAuthenticated(), IsShopAdmin()]

    def get_object(self):
        shop = get_user_shop(self.request.user)
        if self.request.method == 'GET':
            self.check_object_permissions(self.request, shop)
        return shop


class ShopMemberListView(generics.ListCreateAPIView):
    """GET liste les membres de la boutique courante.
    POST crée un nouveau staff (admin only — création directe avec email/password)."""
    permission_classes = (IsAuthenticated, IsShopAdmin)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ShopMemberCreateSerializer
        return ShopMemberSerializer

    def get_queryset(self):
        shop = get_user_shop(self.request.user)
        return ShopMember.objects.filter(shop=shop).select_related('user').order_by('created_at')

    def create(self, request, *args, **kwargs):
        shop = get_user_shop(request.user)
        serializer = ShopMemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        member = create_staff_member(
            shop=shop,
            email=data['email'],
            full_name=data['full_name'],
            phone=data.get('phone', ''),
            password=data['password'],
            permissions=data.get('permissions', []),
        )
        return Response(
            ShopMemberSerializer(member).data,
            status=status.HTTP_201_CREATED,
        )


class ShopMemberDetailView(generics.GenericAPIView):
    """PATCH met à jour rôle/permissions d'un membre.
    DELETE retire le membre de la boutique. Admin only."""
    permission_classes = (IsAuthenticated, IsShopAdmin)
    serializer_class = ShopMemberUpdateSerializer

    def get_object(self):
        shop = get_user_shop(self.request.user)
        try:
            return ShopMember.objects.select_related('user').get(
                pk=self.kwargs['pk'], shop=shop,
            )
        except ShopMember.DoesNotExist as exc:
            raise PermissionDenied('Membre introuvable.') from exc

    def patch(self, request, *args, **kwargs):
        member = self.get_object()
        # Un admin ne peut pas se retirer ses propres droits.
        if member.user_id == request.user.id:
            return Response(
                {'detail': 'Vous ne pouvez pas modifier votre propre rôle ou vos permissions.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = update_member_permissions(
            member=member,
            role=serializer.validated_data.get('role'),
            permissions=serializer.validated_data.get('permissions'),
        )
        return Response(ShopMemberSerializer(member).data)

    def delete(self, request, *args, **kwargs):
        member = self.get_object()
        if member.user_id == request.user.id:
            return Response(
                {'detail': 'Vous ne pouvez pas vous retirer vous-même.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        remove_member(member)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShopLogoView(APIView):
    """Upload (POST) ou suppression (DELETE) du logo de la boutique courante — admin uniquement."""
    permission_classes = (IsAuthenticated, IsShopAdmin)
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


class OnboardingView(APIView):
    """Finalise le wizard 1er login pour la boutique courante. Admin only.
    Idempotent : si l'onboarding a déjà été fait, l'appel met juste à jour les
    préférences sans toucher à `onboarding_completed_at`."""

    permission_classes = (IsAuthenticated, IsShopAdmin)

    def post(self, request) -> Response:
        shop = get_user_shop(request.user)
        serializer = OnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shop.catalog_kind = serializer.validated_data['catalog_kind']
        shop.dashboard_mode = serializer.validated_data['dashboard_mode']
        if shop.onboarding_completed_at is None:
            shop.onboarding_completed_at = timezone.now()
        shop.save(update_fields=['catalog_kind', 'dashboard_mode', 'onboarding_completed_at', 'updated_at'])
        return Response(ShopSerializer(shop, context={'request': request}).data)


class AdminShopListView(generics.ListAPIView):
    """Liste toutes les boutiques avec leurs membres — réservé aux superadmins."""
    serializer_class = AdminShopSerializer
    permission_classes = (IsAdminUser,)

    def get_queryset(self):
        return Shop.objects.prefetch_related(
            'members', 'members__user'
        ).order_by('-created_at')
