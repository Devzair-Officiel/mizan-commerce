from decimal import Decimal
from rest_framework import serializers
from .models import Product, ProductImage, ProductVariant


class ProductImageSerializer(serializers.ModelSerializer):
    # URL signée (1 h) ; None si le bucket n'est pas configuré.
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ('id', 'url', 'is_primary', 'position', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_url(self, obj: ProductImage) -> str | None:
        from apps.core.storage import get_signed_url, is_storage_configured
        return get_signed_url(obj.object_key) if is_storage_configured() else None


class ProductImagePrimarySerializer(serializers.Serializer):
    """PATCH d'une photo : seule la désignation de la photo principale est possible."""  # noqa: E501
    is_primary = serializers.BooleanField()

    def validate_is_primary(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                'Choisissez une autre photo principale plutôt que de retirer celle-ci.',  # noqa: E501
            )
        return value


class ProductVariantSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)
    is_negative_stock = serializers.BooleanField(read_only=True)
    stock_state = serializers.CharField(read_only=True)
    # Jamais servi (ni commande, ni mouvement autre que le stock initial) : supprimable.
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = (
            'id', 'packaging_name', 'unit', 'base_quantity',
            'selling_price', 'purchase_price',
            'stock_quantity', 'low_stock_threshold',
            'sku', 'barcode', 'position', 'is_active',
            'is_low_stock', 'is_out_of_stock', 'is_negative_stock', 'stock_state',
            'can_delete', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'stock_quantity', 'created_at', 'updated_at')

    def get_can_delete(self, obj: ProductVariant) -> bool:
        # Calculé une fois par article : les formats de la fiche partagent leur produit.
        from .services import served_variant_ids
        product = obj.product
        served = getattr(product, '_served_variant_ids', None)
        if served is None:
            served = product._served_variant_ids = served_variant_ids(product)
        return obj.pk not in served

    def validate_packaging_name(self, value: str) -> str:
        # Unicité du packaging au sein d'un produit (excepté l'instance courante en édition).  # noqa: E501
        product = self.context.get('product')
        if product is None and self.instance is not None:
            product = self.instance.product
        if product is None:
            return value
        qs = ProductVariant.objects.filter(product=product, packaging_name__iexact=value)  # noqa: E501
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ce nom de conditionnement existe déjà pour ce produit.")  # noqa: E501
        return value

    def validate_is_active(self, value: bool) -> bool:
        from .services import LAST_ACTIVE_VARIANT_MESSAGE, is_last_active_variant
        if not value and self.instance is not None and is_last_active_variant(self.instance):  # noqa: E501
            raise serializers.ValidationError(LAST_ACTIVE_VARIANT_MESSAGE)
        return value

    def validate_base_quantity(self, value):
        if value <= Decimal('0'):
            raise serializers.ValidationError('La quantité de base doit être strictement positive.')  # noqa: E501
        return value

    def validate_selling_price(self, value):
        if value < Decimal('0'):
            raise serializers.ValidationError('Le prix de vente ne peut pas être négatif.')  # noqa: E501
        return value


class ProductVariantCreateSerializer(ProductVariantSerializer):
    """Nouveau format d'un article existant, avec son stock initial."""
    initial_stock = serializers.DecimalField(
        max_digits=16, decimal_places=3, min_value=Decimal('0'),
        write_only=True, required=False, allow_null=True,
    )

    def validate(self, attrs: dict) -> dict:
        product = self.context.get('product')
        if attrs.get('initial_stock') and product is not None and product.type == 'service':  # noqa: E501
            raise serializers.ValidationError(
                {'initial_stock': ["Un service n'a pas de stock."]},
            )
        return attrs

    class Meta(ProductVariantSerializer.Meta):
        fields = (*ProductVariantSerializer.Meta.fields, 'initial_stock')


VARIANT_ROWS_MAX = 50


class VariantRowSerializer(serializers.Serializer):
    """Ligne du tableau des formats (formulaire article).

    Sans `id` : nouveau format, avec son stock initial ; avec `id` : format
    existant de l'article, modifié (son stock ne change que par des mouvements).
    """
    id = serializers.UUIDField(required=False, allow_null=True)
    packaging_name = serializers.CharField(max_length=120)
    unit = serializers.ChoiceField(choices=Product.UNIT_CHOICES, required=False)
    base_quantity = serializers.DecimalField(
        max_digits=14, decimal_places=3, min_value=Decimal('0.001'), required=False,
    )
    selling_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'),
    )
    purchase_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'),
        required=False, allow_null=True,
    )
    low_stock_threshold = serializers.DecimalField(
        max_digits=14, decimal_places=3, min_value=Decimal('0'),
        required=False, allow_null=True,
    )
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True)
    barcode = serializers.CharField(max_length=64, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    initial_stock = serializers.DecimalField(
        max_digits=16, decimal_places=3, min_value=Decimal('0'),
        required=False, allow_null=True,
    )


def _duplicate_row_errors(rows: list[dict]) -> dict[int, dict[str, list[str]]]:
    """Noms (sans tenir compte de la casse) et références en double, par ligne."""
    errors: dict[int, dict[str, list[str]]] = {}
    names: set[str] = set()
    skus: set[str] = set()
    for index, row in enumerate(rows):
        name = row['packaging_name'].casefold()
        if name in names:
            errors.setdefault(index, {})['packaging_name'] = [
                'Ce nom de format est déjà utilisé dans cet article.',
            ]
        names.add(name)
        sku = row.get('sku', '')
        if sku and sku in skus:
            errors.setdefault(index, {})['sku'] = [
                'Cette référence est déjà utilisée par un autre format.',
            ]
        skus.add(sku)
    return errors


class VariantRowsField(serializers.ListField):
    """`variants` de l'article : ses formats en lecture, le tableau du formulaire
    en écriture (création, ou synchronisation en modification)."""
    child = VariantRowSerializer()

    def __init__(self, **kwargs) -> None:
        super().__init__(
            min_length=1, max_length=VARIANT_ROWS_MAX, required=False, **kwargs,
        )

    def to_representation(self, value) -> list:
        return ProductVariantSerializer(value.all(), many=True, context=self.context).data  # noqa: E501

    def to_internal_value(self, data) -> list[dict]:
        rows = super().to_internal_value(data)
        errors = _duplicate_row_errors(rows)
        if errors:
            raise serializers.ValidationError(errors)
        return rows


def _primary_image_url(product: Product) -> str | None:
    """URL signée de l'image principale (ou première image disponible). None si pas d'image
    ou si le bucket S3 n'est pas configuré."""  # noqa: E501
    from django.conf import settings
    from apps.core.storage import get_signed_url

    img = next((i for i in product.images.all() if i.is_primary), None)
    if img is None:
        img = next(iter(product.images.all()), None)
    if img is None:
        return None
    if not getattr(settings, 'AWS_S3_ENDPOINT_URL', None):
        return None
    return get_signed_url(img.object_key)


def _variant_aggregates(product: Product) -> dict:
    """Agrégats min/max/flags à partir des variantes actives.

    Volontairement pas de `total_stock` : depuis que le stock est compté en formats,
    sommer 50 bouteilles + 10 sacs n'a aucun sens commercial. Le front affiche
    `variant_count` + le détail par variante (voir VariantsManager).
    """
    variants = [v for v in product.variants.all() if v.is_active]
    if not variants:
        return {
            'min_selling_price': None,
            'max_selling_price': None,
            'variant_count': 0,
            'is_low_stock_any': False,
            'is_out_of_stock_all': True,
            'is_negative_any': False,
            'stock_state': None if product.type == 'service' else 'out',
        }
    prices = [v.selling_price for v in variants]
    return {
        'min_selling_price': min(prices),
        'max_selling_price': max(prices),
        'variant_count': len(variants),
        'is_low_stock_any': any(v.is_low_stock for v in variants),
        'is_out_of_stock_all': all(v.is_out_of_stock for v in variants),
        'is_negative_any': any(v.is_negative_stock for v in variants),
        'stock_state': _product_stock_state(product, variants),
    }


def _product_stock_state(
    product: Product, variants: list[ProductVariant],
) -> str | None:
    """État exclusif d'un article (voir `STOCK_LEVELS`) ; `None` pour un service."""
    if product.type == 'service':
        return None
    if any(v.is_negative_stock for v in variants):
        return 'negative'
    if all(v.is_out_of_stock for v in variants):
        return 'out'
    return 'low' if any(v.is_low_stock for v in variants) else 'in'


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    variants = VariantRowsField()
    # Agrégats calculés à partir des variantes (source de vérité depuis la migration v2).  # noqa: E501
    min_selling_price = serializers.SerializerMethodField()
    max_selling_price = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()
    is_negative_stock = serializers.SerializerMethodField()
    stock_state = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    # Fiche article : stock total, valeur d'achat et ventes récentes.
    stock_total = serializers.SerializerMethodField()
    purchase_value = serializers.SerializerMethodField()
    sales_30d = serializers.SerializerMethodField()
    # Création seulement : format unique et stock initial (ancien appel ; `variants`
    # porte le tableau des formats, en création comme en modification).
    variant = ProductVariantSerializer(write_only=True, required=False)
    initial_stock = serializers.DecimalField(
        max_digits=16, decimal_places=3, min_value=Decimal('0'),
        write_only=True, required=False, allow_null=True,
    )

    def validate(self, attrs: dict) -> dict:
        creation_only = 'variant' in attrs or 'initial_stock' in attrs
        if self.instance is not None and creation_only:
            raise serializers.ValidationError(
                {'variant': ['Modifiez les formats depuis leur propre adresse.']},
            )
        if 'variant' in attrs and 'variants' in attrs:
            raise serializers.ValidationError(
                {'variants': ['Envoyez soit un format, soit le tableau des formats.']},
            )
        if attrs.get('initial_stock') and 'variant' not in attrs:
            raise serializers.ValidationError(
                {'initial_stock': ['Le stock initial demande un format.']},
            )
        kind = attrs.get('type', self.instance.type if self.instance else 'product')
        if attrs.get('initial_stock') and kind == 'service':
            raise serializers.ValidationError(
                {'initial_stock': ["Un service n'a pas de stock."]},
            )
        self._validate_rows(attrs.get('variants', []), kind)
        return attrs

    def _validate_rows(self, rows: list[dict], kind: str) -> None:
        """Stock initial : article seulement ; identifiants : modification seulement."""
        errors: dict[int, dict[str, list[str]]] = {}
        for index, row in enumerate(rows):
            if row.get('initial_stock') and kind == 'service':
                errors[index] = {'initial_stock': ["Un service n'a pas de stock."]}
            elif row.get('id') and self.instance is None:
                errors[index] = {'id': ["Un nouvel article n'a pas encore de format."]}
        if errors:
            raise serializers.ValidationError({'variants': errors})

    def validate_name(self, value: str) -> str:
        shop = self.context.get('shop')
        if shop is None:
            # Pas de scope (ex: introspection schema) → on n'a rien à valider.
            return value
        qs = Product.objects.filter(shop=shop, name__iexact=value)
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

    def get_variant_count(self, obj):
        return self._agg(obj)['variant_count']

    def get_is_low_stock(self, obj):
        return self._agg(obj)['is_low_stock_any']

    def get_is_out_of_stock(self, obj):
        return self._agg(obj)['is_out_of_stock_all']

    def get_is_negative_stock(self, obj):
        return self._agg(obj)['is_negative_any']

    def get_stock_state(self, obj):
        return self._agg(obj)['stock_state']

    def get_primary_image(self, obj):
        return _primary_image_url(obj)

    def get_can_delete(self, obj: Product) -> bool:
        from .services import product_has_served
        return not product_has_served(obj)

    def _stock_totals(self, obj: Product) -> dict:
        cached = getattr(obj, '_stock_totals_cache', None)
        if cached is None:
            from .services import product_stock_totals
            cached = obj._stock_totals_cache = product_stock_totals(obj)
        return cached

    def get_stock_total(self, obj: Product) -> str | None:
        quantity = self._stock_totals(obj)['quantity']
        return str(quantity) if quantity is not None else None

    def get_purchase_value(self, obj: Product) -> str | None:
        value = self._stock_totals(obj)['purchase_value']
        return str(value) if value is not None else None

    def get_sales_30d(self, obj: Product) -> dict:
        from .services import product_sales
        sales = product_sales(obj)
        return {'quantity': sales['quantity'], 'amount': str(sales['amount'])}

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'type', 'description',
            'is_active', 'is_low_stock', 'is_out_of_stock', 'is_negative_stock',
            'stock_state', 'min_selling_price', 'max_selling_price', 'variant_count',
            'variants', 'images', 'primary_image', 'can_delete',
            'stock_total', 'purchase_value', 'sales_30d',
            'variant', 'initial_stock',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class ProductListSerializer(serializers.ModelSerializer):
    """Version allégée pour les listes — expose les agrégats variantes."""
    primary_image = serializers.SerializerMethodField()
    min_selling_price = serializers.SerializerMethodField()
    max_selling_price = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()
    is_negative_stock = serializers.SerializerMethodField()
    stock_state = serializers.SerializerMethodField()
    # Annoté par `products_with_stats` : stock total des formats actifs (None pour un service).  # noqa: E501
    total_stock = serializers.DecimalField(
        max_digits=16, decimal_places=3, read_only=True, allow_null=True, default=None,
    )

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'type',
            'is_active', 'is_low_stock', 'is_out_of_stock', 'is_negative_stock',
            'stock_state',
            'min_selling_price', 'max_selling_price', 'variant_count', 'total_stock',
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

    def get_variant_count(self, obj):
        return self._agg(obj)['variant_count']

    def get_is_low_stock(self, obj):
        return self._agg(obj)['is_low_stock_any']

    def get_is_out_of_stock(self, obj):
        return self._agg(obj)['is_out_of_stock_all']

    def get_primary_image(self, obj):
        return _primary_image_url(obj)

    def get_is_negative_stock(self, obj):
        return self._agg(obj)['is_negative_any']

    def get_stock_state(self, obj):
        return self._agg(obj)['stock_state']
