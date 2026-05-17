from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shops.models import ShopMember
from apps.products.models import Product
from .models import StockMovement
from .serializers import StockMovementSerializer, StockInSerializer, StockOutSerializer


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class StockMovementListView(generics.ListAPIView):
    """Historique des mouvements de stock, filtrables par produit."""
    serializer_class = StockMovementSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = StockMovement.objects.filter(shop=shop).select_related('product', 'created_by')
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs


class StockInView(APIView):
    """Entrée stock (réassort)."""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        shop = get_shop(request.user)
        serializer = StockInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        try:
            product = Product.objects.get(pk=d['product'], shop=shop)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        movement = StockMovement.objects.create(
            shop=shop,
            product=product,
            movement_type='in',
            quantity=d['quantity'],
            reason=d['reason'],
            created_by=request.user,
        )
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)


class StockOutView(APIView):
    """Sortie stock (perte ou casse)."""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        shop = get_shop(request.user)
        serializer = StockOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        try:
            product = Product.objects.get(pk=d['product'], shop=shop)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if product.stock_quantity < d['quantity']:
            return Response(
                {'detail': f'Stock insuffisant (disponible : {product.stock_quantity}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        movement = StockMovement.objects.create(
            shop=shop,
            product=product,
            movement_type=d['movement_type'],
            quantity=d['quantity'],
            reason=d['reason'],
            created_by=request.user,
        )
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
