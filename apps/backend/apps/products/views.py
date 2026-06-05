from django.db.models import F, Exists, OuterRef, Q
from rest_framework import generics, filters, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import get_shop
from .models import Product, ProductImage, ProductVariant
from .serializers import ProductSerializer, ProductListSerializer, ProductVariantSerializer


class ProductListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ('name', 'variants__sku')
    ordering_fields = ('name', 'created_at')
    ordering = ('-created_at',)

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return ProductListSerializer
        return ProductSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = Product.objects.filter(shop=shop).prefetch_related('images', 'variants')

        # Filtres d'activation
        # - `?inactive=1` : uniquement les inactifs
        # - `?all=1`     : actifs + inactifs
        # - défaut       : uniquement les actifs
        if self.request.query_params.get('inactive') == '1':
            qs = qs.filter(is_active=False)
        elif self.request.query_params.get('all') != '1':
            qs = qs.filter(is_active=True)

        # Filtre par type (product | service)
        product_type = self.request.query_params.get('type')
        if product_type in ('product', 'service'):
            qs = qs.filter(type=product_type)

        # Filtre rupture : toutes les variantes actives ont un stock <= 0 → produit en rupture.
        # On exclut donc les produits qui possèdent au moins une variante active avec stock > 0.
        if self.request.query_params.get('out_of_stock') == '1':
            has_stock = ProductVariant.objects.filter(
                product=OuterRef('pk'), is_active=True, stock_quantity__gt=0,
            )
            qs = qs.filter(type='product').annotate(_has_stock=Exists(has_stock)).filter(_has_stock=False)

        # Filtre stock faible : au moins une variante active sous son seuil.
        if self.request.query_params.get('low_stock') == '1':
            has_low = ProductVariant.objects.filter(
                product=OuterRef('pk'),
                is_active=True,
                low_stock_threshold__isnull=False,
                stock_quantity__lte=F('low_stock_threshold'),
                stock_quantity__gt=0,
            )
            qs = qs.filter(type='product').annotate(_has_low=Exists(has_low)).filter(_has_low=True)

        return qs

    def perform_create(self, serializer):
        shop = get_shop(self.request.user)
        serializer.save(shop=shop)


class ProductDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ProductSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return Product.objects.filter(shop=shop).prefetch_related('images', 'variants')

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = kwargs.get('partial', False)
        serializer = self.get_serializer(
            self.get_object(),
            data=request.data,
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


class ProductSummaryView(APIView):
    """Compteurs agrégés pour le bandeau de filtres du Catalogue."""
    permission_classes = (IsAuthenticated,)

    def get(self, request) -> Response:
        shop = get_shop(request.user)
        active_qs = Product.objects.filter(shop=shop, is_active=True)

        has_stock = ProductVariant.objects.filter(
            product=OuterRef('pk'), is_active=True, stock_quantity__gt=0,
        )
        has_low = ProductVariant.objects.filter(
            product=OuterRef('pk'),
            is_active=True,
            low_stock_threshold__isnull=False,
            stock_quantity__lte=F('low_stock_threshold'),
            stock_quantity__gt=0,
        )

        out_of_stock = (
            active_qs.filter(type='product')
            .annotate(_has_stock=Exists(has_stock))
            .filter(_has_stock=False)
            .count()
        )
        low_stock = (
            active_qs.filter(type='product')
            .annotate(_has_low=Exists(has_low))
            .filter(_has_low=True)
            .count()
        )
        products_count = active_qs.filter(type='product').count()
        services_count = active_qs.filter(type='service').count()
        inactive_count = Product.objects.filter(shop=shop, is_active=False).count()

        return Response({
            'total': products_count + services_count,
            'products': products_count,
            'services': services_count,
            'out_of_stock': out_of_stock,
            'low_stock': low_stock,
            'inactive': inactive_count,
        })


class ProductVariantListCreateView(generics.ListCreateAPIView):
    """Liste/crée les variantes d'un produit donné."""
    permission_classes = (IsAuthenticated,)
    serializer_class = ProductVariantSerializer

    def _get_product(self) -> Product:
        shop = get_shop(self.request.user)
        return generics.get_object_or_404(Product.objects.filter(shop=shop), pk=self.kwargs['pk'])

    def get_queryset(self):
        product = self._get_product()
        return product.variants.all()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['product'] = self._get_product()
        return ctx

    def perform_create(self, serializer):
        product = self._get_product()
        serializer.save(shop=product.shop, product=product)


class ProductVariantDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Détail / mise à jour / suppression d'une variante."""
    permission_classes = (IsAuthenticated,)
    serializer_class = ProductVariantSerializer
    lookup_url_kwarg = 'variant_pk'

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return ProductVariant.objects.filter(shop=shop, product__pk=self.kwargs['pk'])

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

    def destroy(self, request, *args, **kwargs):
        variant = self.get_object()
        # Garde-fou : on refuse de supprimer la dernière variante d'un produit.
        if variant.product.variants.count() <= 1:
            return Response(
                {'detail': "Un produit doit conserver au moins une variante."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


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
