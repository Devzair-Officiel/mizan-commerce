from rest_framework import serializers
from .models import Product, ProductImage


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ('id', 'object_key', 'is_primary', 'position', 'created_at')
        read_only_fields = ('id', 'created_at')


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)

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

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'reference', 'description',
            'purchase_price', 'selling_price',
            'stock_quantity', 'low_stock_threshold',
            'is_active', 'is_low_stock', 'is_out_of_stock',
            'images', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'stock_quantity', 'created_at', 'updated_at')


class ProductListSerializer(serializers.ModelSerializer):
    """Version allégée pour les listes."""
    primary_image = serializers.SerializerMethodField()
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'reference', 'selling_price',
            'stock_quantity', 'low_stock_threshold',
            'is_active', 'is_low_stock', 'is_out_of_stock',
            'primary_image', 'updated_at',
        )

    def get_primary_image(self, obj):
        img = obj.images.filter(is_primary=True).first() or obj.images.first()
        return img.object_key if img else None
