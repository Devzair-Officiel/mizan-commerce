from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop

HasStockModule = HasModulePermission.for_module('stock')
from apps.products.models import ProductVariant  # noqa: E402
from .models import StockMovement  # noqa: E402
from .serializers import StockMovementSerializer, StockInSerializer, StockOutSerializer  # noqa: E402
from .services import create_movement  # noqa: E402


class StockMovementListView(generics.ListAPIView):
    """Historique des mouvements de stock, filtrables par produit ou variante."""
    serializer_class = StockMovementSerializer
    permission_classes = (IsAuthenticated, HasStockModule)

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = (
            StockMovement.objects.filter(shop=shop)
            .select_related('variant__product', 'created_by')
        )
        variant_id = self.request.query_params.get('variant')
        if variant_id:
            qs = qs.filter(variant_id=variant_id)
        # Rétro-compat : ?product= filtre sur toutes les variantes du produit.
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(variant__product_id=product_id)
        return qs


class StockInView(APIView):
    """Entrée stock (réassort) sur une variante."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request):
        shop = get_shop(request.user)
        serializer = StockInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        try:
            variant = ProductVariant.objects.get(pk=d['variant'], shop=shop)
        except ProductVariant.DoesNotExist:
            return Response({'detail': 'Variante introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

        try:
            movement = create_movement(
                shop=shop,
                variant=variant,
                movement_type='in',
                quantity=d['quantity'],
                reason=d['reason'],
                created_by=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)  # noqa: E501


class StockOutView(APIView):
    """Sortie stock (perte ou casse) sur une variante."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request):
        shop = get_shop(request.user)
        serializer = StockOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        try:
            variant = ProductVariant.objects.get(pk=d['variant'], shop=shop)
        except ProductVariant.DoesNotExist:
            return Response({'detail': 'Variante introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

        if variant.stock_quantity < d['quantity']:
            return Response(
                {'detail': f'Stock insuffisant (disponible : {variant.stock_quantity}).'},  # noqa: E501
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            movement = create_movement(
                shop=shop,
                variant=variant,
                movement_type=d['movement_type'],
                quantity=d['quantity'],
                reason=d['reason'],
                created_by=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)  # noqa: E501
