from rest_framework import generics, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.shops.models import ShopMember
from .models import Product
from .serializers import ProductSerializer, ProductListSerializer


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class ProductListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ('name', 'reference')
    ordering_fields = ('name', 'selling_price', 'stock_quantity', 'created_at')
    ordering = ('-created_at',)

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return ProductListSerializer
        return ProductSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = Product.objects.filter(shop=shop).prefetch_related('images')

        # Filtre actifs uniquement par défaut, sauf si ?all=1
        if self.request.query_params.get('all') != '1':
            qs = qs.filter(is_active=True)

        # Filtre stock faible
        if self.request.query_params.get('low_stock') == '1':
            from django.db.models import Q, F
            qs = qs.filter(
                low_stock_threshold__isnull=False,
                stock_quantity__lte=F('low_stock_threshold'),
                stock_quantity__gt=0,
            )

        return qs

    def perform_create(self, serializer):
        shop = get_shop(self.request.user)
        serializer.save(shop=shop)


class ProductDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ProductSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return Product.objects.filter(shop=shop).prefetch_related('images')

    def update(self, request, *args, **kwargs):
        # stock_quantity est un cache dérivé des mouvements, non modifiable directement
        kwargs['partial'] = kwargs.get('partial', False)
        serializer = self.get_serializer(
            self.get_object(),
            data={k: v for k, v in request.data.items() if k != 'stock_quantity'},
            partial=kwargs['partial'],
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)


class ProductDeactivateView(generics.GenericAPIView):
    """Soft delete : désactive le produit (is_active=False)."""
    permission_classes = (IsAuthenticated,)
    serializer_class = ProductSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return Product.objects.filter(shop=shop)

    def post(self, request, *args, **kwargs):
        product = self.get_object()
        product.is_active = False
        product.save(update_fields=['is_active', 'updated_at'])
        return Response({'detail': 'Produit désactivé.'})
