from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, filters, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop
from apps.core.storage import is_storage_configured

HasProductsModule = HasModulePermission.for_module('products')
from . import services  # noqa: E402
from .filters import ProductOrderingFilter  # noqa: E402
from .models import Product, ProductImage, ProductVariant  # noqa: E402
from .services import PRODUCT_SEARCH_FIELDS, products_with_stats  # noqa: E402
from .serializers import (  # noqa: E402
    ProductImagePrimarySerializer, ProductImageSerializer, ProductListSerializer,
    ProductSerializer, ProductVariantCreateSerializer, ProductVariantSerializer,
)


class ProductListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated, HasProductsModule)
    filter_backends = (filters.SearchFilter, ProductOrderingFilter)
    search_fields = PRODUCT_SEARCH_FIELDS
    ordering_fields = ('name', 'created_at', 'min_price', 'total_stock', 'type')
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
        qs = products_with_stats(get_shop(self.request.user))
        return services.filter_products(qs, self.request.query_params).prefetch_related(
            'images', 'variants',
        )

    def perform_create(self, serializer):
        shop = get_shop(self.request.user)
        data = dict(serializer.validated_data)
        rows = data.pop('variants', [])
        variant = data.pop('variant', None)
        initial_stock = data.pop('initial_stock', None)
        if variant is not None:
            rows = [{**variant, 'initial_stock': initial_stock}]
        user = self.request.user
        serializer.instance = services.create_product(shop, user, data, rows)


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated, HasProductsModule)
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

    def perform_update(self, serializer: ProductSerializer) -> None:
        """Informations et, avec `variants`, tableau des formats : tout ou rien."""
        data = dict(serializer.validated_data)
        rows = data.pop('variants', None)
        product = services.update_product(serializer.instance, self.request.user, data, rows)  # noqa: E501
        # Relue : les formats préchargés avant la synchronisation sont périmés.
        serializer.instance = self.get_queryset().get(pk=product.pk)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        """Suppression d'un article qui n'a jamais servi ; sinon 409 (le désactiver)."""
        try:
            services.delete_unused_product(self.get_object())
        except services.ProductInUseError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductDeactivateView(generics.GenericAPIView):
    """Soft delete : désactive le produit (is_active=False)."""
    permission_classes = (IsAuthenticated, HasProductsModule)
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
    permission_classes = (IsAuthenticated, HasProductsModule)
    serializer_class = ProductSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return Product.objects.filter(shop=shop)

    def post(self, request, *args, **kwargs):
        services.reactivate_product(self.get_object())
        return Response({'detail': 'Produit réactivé.'})


class ProductImageUploadView(APIView):
    """Upload d'une photo produit vers le bucket privé OVH."""
    permission_classes = (IsAuthenticated, HasProductsModule)
    parser_classes = (MultiPartParser,)

    def post(self, request, pk: str) -> Response:
        from django.conf import settings
        from .services import upload_product_image

        if not settings.AWS_S3_ENDPOINT_URL or not settings.AWS_ACCESS_KEY_ID:
            return Response(
                {'detail': "L'upload vers Object Storage n'est pas configuré sur cet environnement."},  # noqa: E501
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        shop = get_shop(request.user)
        file = request.FILES.get('image')
        if not file:
            return Response({'detail': 'Champ « image » requis.'}, status=status.HTTP_400_BAD_REQUEST)  # noqa: E501

        try:
            image = upload_product_image(shop=shop, product_id=pk, file=file)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

        # Mêmes champs que la fiche : la clé de stockage n'est pas exposée.
        return Response(ProductImageSerializer(image).data, status=status.HTTP_201_CREATED)  # noqa: E501


class ProductSummaryView(APIView):
    """Indicateurs du Catalogue (actifs, rupture, stock faible)."""
    permission_classes = (IsAuthenticated, HasProductsModule)

    def get(self, request: Request) -> Response:
        return Response(services.build_products_summary(get_shop(request.user)))


class ProductFacetsView(APIView):
    """Nombre d'articles par option des filtres (état, type, stock).

    Reçoit les mêmes paramètres que la liste (recherche comprise).
    """
    permission_classes = (IsAuthenticated, HasProductsModule)
    search_fields = PRODUCT_SEARCH_FIELDS

    def get(self, request: Request) -> Response:
        qs = products_with_stats(get_shop(request.user))
        qs = filters.SearchFilter().filter_queryset(request, qs, self)
        return Response(services.build_product_facets(qs, request.query_params))


class ProductVariantListCreateView(generics.ListCreateAPIView):
    """Liste/crée les variantes d'un produit donné."""
    permission_classes = (IsAuthenticated, HasProductsModule)
    serializer_class = ProductVariantSerializer

    def _get_product(self) -> Product:
        shop = get_shop(self.request.user)
        return generics.get_object_or_404(Product.objects.filter(shop=shop), pk=self.kwargs['pk'])  # noqa: E501

    def get_queryset(self):
        product = self._get_product()
        return product.variants.all()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['product'] = self._get_product()
        return ctx

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ProductVariantCreateSerializer
        return ProductVariantSerializer

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        initial_stock = data.pop('initial_stock', None)
        serializer.instance = services.create_variant(
            self._get_product(), self.request.user, data, initial_stock,
        )


class ProductVariantDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Détail / mise à jour / suppression d'une variante."""
    permission_classes = (IsAuthenticated, HasProductsModule)
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
        if services.is_last_active_variant(variant):
            return Response(
                {'detail': services.LAST_ACTIVE_VARIANT_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            services.delete_unused_variant(variant)
        except services.VariantInUseError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageSignedUrlView(APIView):
    """Génère une URL signée (1h) pour une image produit."""
    permission_classes = (IsAuthenticated, HasProductsModule)

    def get(self, request, pk: str, image_pk: str) -> Response:
        from .services import get_signed_url

        shop = get_shop(request.user)
        try:
            image = ProductImage.objects.get(pk=image_pk, product__pk=pk, shop=shop)
        except ProductImage.DoesNotExist:
            return Response({'detail': 'Image introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

        signed_url = get_signed_url(image.object_key)
        return Response({'url': signed_url})


_STORAGE_UNAVAILABLE = {'detail': "Le stockage des photos n'est pas configuré sur cet environnement."}  # noqa: E501


def _shop_image(request: Request, pk: str, image_pk: str) -> ProductImage:
    """Photo d'un article de la boutique courante, sinon 404."""
    shop = get_shop(request.user)
    return get_object_or_404(ProductImage, pk=image_pk, product__pk=pk, shop=shop)


class ProductImageDetailView(APIView):
    """Photo d'un article : devient la photo principale (PATCH) ou est retirée (DELETE)."""  # noqa: E501
    permission_classes = (IsAuthenticated, HasProductsModule)

    def patch(self, request: Request, pk: str, image_pk: str) -> Response:
        image = _shop_image(request, pk, image_pk)
        ProductImagePrimarySerializer(data=request.data).is_valid(raise_exception=True)
        services.set_primary_image(image)
        return Response(ProductImageSerializer(image).data)

    def delete(self, request: Request, pk: str, image_pk: str) -> Response:
        services.delete_product_image(_shop_image(request, pk, image_pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageFileView(APIView):
    """Fichier d'une photo : lu par l'app (recadrage dans le navigateur, même
    origine) et remplacé par la version recadrée."""
    permission_classes = (IsAuthenticated, HasProductsModule)
    parser_classes = (MultiPartParser,)

    def get(self, request: Request, pk: str, image_pk: str) -> HttpResponse:
        image = _shop_image(request, pk, image_pk)
        if not is_storage_configured():
            return Response(_STORAGE_UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)  # noqa: E501
        content, content_type = services.read_image_file(image)
        response = HttpResponse(content, content_type=content_type)
        response['Cache-Control'] = 'private, no-store'
        return response

    def put(self, request: Request, pk: str, image_pk: str) -> Response:
        image = _shop_image(request, pk, image_pk)
        if not is_storage_configured():
            return Response(_STORAGE_UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)  # noqa: E501
        file = request.FILES.get('image')
        if not file:
            return Response({'detail': 'Champ « image » requis.'}, status=status.HTTP_400_BAD_REQUEST)  # noqa: E501
        services.replace_image_file(image, file)
        return Response(ProductImageSerializer(image).data)
