from decimal import Decimal
from rest_framework import serializers
from .models import Product, ProductImage, ProductVariant


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ('id', 'object_key', 'is_primary', 'position', 'created_at')
        read_only_fields = ('id', 'created_at')


class ProductVariantSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = (
            'id', 'packaging_name', 'unit', 'base_quantity',
            'selling_price', 'purchase_price',
            'stock_quantity', 'low_stock_threshold',
            'sku', 'barcode', 'position', 'is_active',
            'is_low_stock', 'is_out_of_stock',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'stock_quantity', 'created_at', 'updated_at')

    def validate_packaging_name(self, value: str) -> str:
        # Unicité du packaging au sein d'un produit (excepté l'instance courante en édition).
        product = self.context.get('product')
        if product is None and self.instance is not None:
            product = self.instance.product
        if product is None:
            return value
        qs = ProductVariant.objects.filter(product=product, packaging_name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ce nom de conditionnement existe déjà pour ce produit.")
        return value

    def validate_base_quantity(self, value):
        if value <= Decimal('0'):
            raise serializers.ValidationError('La quantité de base doit être strictement positive.')
        return value

    def validate_selling_price(self, value):
        if value < Decimal('0'):
            raise serializers.ValidationError('Le prix de vente ne peut pas être négatif.')
        return value


def _variant_aggregates(product: Product) -> dict:
    """Calcule les agrégats min/max/total/flags à partir des variantes actives."""
    variants = [v for v in product.variants.all() if v.is_active]
    if not variants:
        return {
            'min_selling_price': None,
            'max_selling_price': None,
            'total_stock': Decimal('0'),
            'variant_count': 0,
            'is_low_stock_any': False,
            'is_out_of_stock_all': True,
        }
    prices = [v.selling_price for v in variants]
    return {
        'min_selling_price': min(prices),
        'max_selling_price': max(prices),
        'total_stock': sum((v.stock_quantity for v in variants), Decimal('0')),
        'variant_count': len(variants),
        'is_low_stock_any': any(v.is_low_stock for v in variants),
        'is_out_of_stock_all': all(v.is_out_of_stock for v in variants),
    }


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    # Agrégats calculés à partir des variantes (source de vérité depuis la migration v2).
    min_selling_price = serializers.SerializerMethodField()
    max_selling_price = serializers.SerializerMethodField()
    total_stock = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()

    def validate_name(self, value: str) -> str:
        from apps.shops.models import ShopMember
        request = self.context.get('request')
        if not request:
            return value
        membership = ShopMember.objects.filter(user=request.user).select_related('shop').first()
        if not membership:
            return value
        qs = Product.objects.filter(shop=membership.shop, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Un produit avec ce nom existe déjà.')
        return value

    def _agg(self, obj):
        cached = getattr(obj, '_variant_agg_cache', None)
        if cached is None:
            cached = _variant_aggregates(obj)
            obj._variant_agg_cache = cached
        return cached

    def get_min_selling_price(self, obj):
        v = self._agg(obj)['min_selling_price']
        return str(v) if v is not None else None

    def get_max_selling_price(self, obj):
        v = self._agg(obj)['max_selling_price']
        return str(v) if v is not None else None

    def get_total_stock(self, obj):
        return str(self._agg(obj)['total_stock'])

    def get_variant_count(self, obj):
        return self._agg(obj)['variant_count']

    def get_is_low_stock(self, obj):
        return self._agg(obj)['is_low_stock_any']

    def get_is_out_of_stock(self, obj):
        return self._agg(obj)['is_out_of_stock_all']

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'type', 'description',
            'is_active', 'is_low_stock', 'is_out_of_stock',
            'min_selling_price', 'max_selling_price', 'total_stock', 'variant_count',
            'variants', 'images', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class ProductListSerializer(serializers.ModelSerializer):
    """Version allégée pour les listes — expose les agrégats variantes."""
    primary_image = serializers.SerializerMethodField()
    min_selling_price = serializers.SerializerMethodField()
    max_selling_price = serializers.SerializerMethodField()
    total_stock = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'type',
            'is_active', 'is_low_stock', 'is_out_of_stock',
            'min_selling_price', 'max_selling_price', 'total_stock', 'variant_count',
            'primary_image', 'updated_at',
        )

    def _agg(self, obj):
        cached = getattr(obj, '_variant_agg_cache', None)
        if cached is None:
            cached = _variant_aggregates(obj)
            obj._variant_agg_cache = cached
        return cached

    def get_min_selling_price(self, obj):
        v = self._agg(obj)['min_selling_price']
        return str(v) if v is not None else None

    def get_max_selling_price(self, obj):
        v = self._agg(obj)['max_selling_price']
        return str(v) if v is not None else None

    def get_total_stock(self, obj):
        return str(self._agg(obj)['total_stock'])

    def get_variant_count(self, obj):
        return self._agg(obj)['variant_count']

    def get_is_low_stock(self, obj):
        return self._agg(obj)['is_low_stock_any']

    def get_is_out_of_stock(self, obj):
        return self._agg(obj)['is_out_of_stock_all']

    def get_primary_image(self, obj):
        from django.conf import settings
        from apps.core.storage import get_signed_url

        img = next((i for i in obj.images.all() if i.is_primary), None)
        if img is None:
            img = next(iter(obj.images.all()), None)
        if img is None:
            return None
        if not getattr(settings, 'AWS_S3_ENDPOINT_URL', None):
            return None
        return get_signed_url(img.object_key)
