from decimal import Decimal

from rest_framework import serializers

from apps.products.models import ProductVariant

from .models import EXIT_TYPES, StockMovement
from .services import MOVEMENT_GROUPS

_GROUP_OF_TYPE = {t: group for group, types in MOVEMENT_GROUPS.items() for t in types}


class StockMovementSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(source='variant.product_id', read_only=True)
    product_name = serializers.CharField(source='variant.product.name', read_only=True)
    variant_name = serializers.CharField(source='variant.packaging_name', read_only=True)  # noqa: E501
    unit = serializers.CharField(source='variant.unit', read_only=True)
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)  # noqa: E501
    # Famille du filtre « type » : in, out, reservation, release, adjustment.
    type_group = serializers.SerializerMethodField()
    signed_quantity = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    # Annotés par `movements_with_references` (absents d'un mouvement tout juste créé).
    order_number = serializers.CharField(read_only=True, default=None)
    order_status = serializers.CharField(read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = (
            'id', 'variant', 'variant_name', 'product_id', 'product_name', 'unit',
            'movement_type', 'movement_type_display', 'type_group',
            'quantity', 'signed_quantity', 'reason', 'order_id',
            'order_number', 'order_status',
            'unit_purchase_price', 'supplier_name', 'invoice_number', 'invoice_date',
            'created_by', 'created_by_email', 'author_name', 'created_at',
        )
        read_only_fields = ('id', 'created_by', 'created_at')

    def get_type_group(self, obj: StockMovement) -> str:
        return _GROUP_OF_TYPE.get(obj.movement_type, obj.movement_type)

    def get_signed_quantity(self, obj: StockMovement) -> str:
        return str(obj.get_signed_quantity())

    def get_author_name(self, obj: StockMovement) -> str | None:
        user = obj.created_by
        if user is None:
            return None
        return user.full_name.strip() or user.email.split('@')[0]

    def validate(self, data):
        movement_type = data.get('movement_type')
        reason = data.get('reason', '')
        if movement_type in ('out', 'loss', 'adjustment') and not reason:
            raise serializers.ValidationError({'reason': 'La raison est obligatoire pour ce type de mouvement.'})  # noqa: E501
        if movement_type != 'adjustment' and data.get('quantity', 0) <= 0:
            raise serializers.ValidationError({'quantity': 'La quantité doit être positive.'})  # noqa: E501
        return data


class StockInSerializer(serializers.Serializer):
    """Entrée stock — référence une variante de produit."""
    variant = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=0)
    reason = serializers.CharField(required=False, default='Réassort')

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('La quantité doit être strictement positive.')  # noqa: E501
        return value


class StockOutSerializer(serializers.Serializer):
    """Sortie stock (perte/casse) — référence une variante."""
    variant = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=0)
    reason = serializers.CharField()
    movement_type = serializers.ChoiceField(choices=EXIT_TYPES, default='loss')

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('La quantité doit être strictement positive.')  # noqa: E501
        return value


_QUANTITY = {'max_digits': 14, 'decimal_places': 3}
_PRICE = {'max_digits': 12, 'decimal_places': 2}


class _EntryLineSerializer(serializers.Serializer):
    variant = serializers.UUIDField()
    quantity = serializers.DecimalField(**_QUANTITY, min_value=Decimal('0.001'))
    unit_purchase_price = serializers.DecimalField(
        **_PRICE, min_value=Decimal('0'), required=False, allow_null=True, default=None,
    )
    # Ligne de la facture lue (entrée depuis une facture uniquement).
    invoice_line_index = serializers.IntegerField(
        min_value=0, required=False, allow_null=True, default=None,
    )


class StockEntrySerializer(serializers.Serializer):
    """Entrée en plusieurs lignes, avec fournisseur et facture facultatifs."""
    lines = _EntryLineSerializer(many=True, allow_empty=False, max_length=200)
    supplier_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')  # noqa: E501
    invoice_number = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')  # noqa: E501
    invoice_date = serializers.DateField(required=False, allow_null=True, default=None)
    ocr_document = serializers.UUIDField(required=False, allow_null=True, default=None)

    def validate(self, data: dict) -> dict:
        indices = [line['invoice_line_index'] for line in data['lines']]
        given = [i for i in indices if i is not None]
        if given and data['ocr_document'] is None:
            raise serializers.ValidationError(
                {'lines': 'Une ligne de facture suppose une facture (ocr_document).'},
            )
        if len(given) != len(set(given)):
            raise serializers.ValidationError(
                {'lines': 'Une même ligne de facture ne peut servir deux fois.'},
            )
        return data


class _ExitLineSerializer(serializers.Serializer):
    variant = serializers.UUIDField()
    quantity = serializers.DecimalField(**_QUANTITY, min_value=Decimal('0.001'))


class StockExitSerializer(serializers.Serializer):
    """Sortie en plusieurs lignes : perte, casse ou usage interne."""
    lines = _ExitLineSerializer(many=True, allow_empty=False, max_length=200)
    reason = serializers.ChoiceField(choices=EXIT_TYPES)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')  # noqa: E501


class _CountLineSerializer(serializers.Serializer):
    variant = serializers.UUIDField()
    counted_quantity = serializers.DecimalField(**_QUANTITY, min_value=Decimal('0'))


class StockAdjustmentSerializer(serializers.Serializer):
    """Correction d'inventaire en plusieurs lignes : la quantité comptée remplace le stock."""  # noqa: E501
    lines = _CountLineSerializer(many=True, allow_empty=False, max_length=200)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')  # noqa: E501

    def validate_lines(self, lines: list[dict]) -> list[dict]:
        variants = [line['variant'] for line in lines]
        if len(variants) != len(set(variants)):
            raise serializers.ValidationError('Un même format ne peut être compté deux fois.')  # noqa: E501
        return lines


class StockLevelSerializer(serializers.ModelSerializer):
    """Une ligne de la liste des niveaux (annotée par `stock_levels`)."""
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    state = serializers.CharField(read_only=True)
    purchase_value = serializers.DecimalField(
        max_digits=20, decimal_places=2, read_only=True, allow_null=True,
    )
    last_movement_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = ProductVariant
        fields = (
            'id', 'product_id', 'product_name', 'packaging_name', 'unit',
            'sku', 'barcode', 'stock_quantity', 'low_stock_threshold',
            'purchase_price', 'state', 'purchase_value', 'last_movement_at',
        )
        read_only_fields = fields
