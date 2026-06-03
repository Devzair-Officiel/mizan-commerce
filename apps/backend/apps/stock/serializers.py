from rest_framework import serializers
from .models import StockMovement


class StockMovementSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(source='variant.product_id', read_only=True)
    product_name = serializers.CharField(source='variant.product.name', read_only=True)
    variant_name = serializers.CharField(source='variant.packaging_name', read_only=True)
    unit = serializers.CharField(source='variant.unit', read_only=True)
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)

    class Meta:
        model = StockMovement
        fields = (
            'id', 'variant', 'variant_name', 'product_id', 'product_name', 'unit',
            'movement_type', 'movement_type_display',
            'quantity', 'reason', 'order_id',
            'created_by', 'created_by_email', 'created_at',
        )
        read_only_fields = ('id', 'created_by', 'created_at')

    def validate(self, data):
        movement_type = data.get('movement_type')
        reason = data.get('reason', '')
        if movement_type in ('out', 'loss', 'adjustment') and not reason:
            raise serializers.ValidationError({'reason': 'La raison est obligatoire pour ce type de mouvement.'})
        if movement_type != 'adjustment' and data.get('quantity', 0) <= 0:
            raise serializers.ValidationError({'quantity': 'La quantité doit être positive.'})
        return data


class StockInSerializer(serializers.Serializer):
    """Entrée stock — référence une variante de produit."""
    variant = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=0)
    reason = serializers.CharField(required=False, default='Réassort')

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('La quantité doit être strictement positive.')
        return value


class StockOutSerializer(serializers.Serializer):
    """Sortie stock (perte/casse) — référence une variante."""
    variant = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=0)
    reason = serializers.CharField()
    movement_type = serializers.ChoiceField(choices=['out', 'loss'], default='out')

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('La quantité doit être strictement positive.')
        return value
