from rest_framework import generics, filters, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shops.models import ShopMember
from .models import Product, ProductImage
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


class ProductReactivateView(generics.GenericAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ProductSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return Product.objects.filter(shop=shop)

    def post(self, request, *args, **kwargs):
        product = self.get_object()
        product.is_active = True
        product.save(update_fields=['is_active', 'updated_at'])
        return Response({'detail': 'Produit réactivé.'})


class ProductImageUploadView(APIView):
    """Upload d'une photo produit vers le bucket privé OVH."""
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)

    def post(self, request, pk: str) -> Response:
        from django.conf import settings
        from .services import upload_product_image, get_signed_url

        if not settings.AWS_S3_ENDPOINT_URL or not settings.AWS_ACCESS_KEY_ID:
            return Response(
                {'detail': "L'upload vers Object Storage n'est pas configuré sur cet environnement."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        shop = get_shop(request.user)
        file = request.FILES.get('image')
        if not file:
            return Response({'detail': 'Champ « image » requis.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            image = upload_product_image(shop=shop, product_id=pk, file=file)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        signed_url = get_signed_url(image.object_key)
        return Response(
            {'id': str(image.pk), 'object_key': image.object_key, 'url': signed_url, 'is_primary': image.is_primary},
            status=status.HTTP_201_CREATED,
        )


class ProductImageSignedUrlView(APIView):
    """Génère une URL signée (1h) pour une image produit."""
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk: str, image_pk: str) -> Response:
        from .services import get_signed_url

        shop = get_shop(request.user)
        try:
            image = ProductImage.objects.get(pk=image_pk, product__pk=pk, shop=shop)
        except ProductImage.DoesNotExist:
            return Response({'detail': 'Image introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        signed_url = get_signed_url(image.object_key)
        return Response({'url': signed_url})
