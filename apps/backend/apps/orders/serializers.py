from decimal import Decimal

from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(source='variant.product_id', read_only=True)
    unit = serializers.CharField(source='variant.unit', read_only=True, default='')

    class Meta:
        model = OrderItem
        fields = (
            'id', 'variant', 'product_id', 'product_name', 'variant_name', 'unit',
            'unit_price', 'quantity', 'line_total', 'created_at',
        )
        read_only_fields = ('id', 'product_name', 'variant_name', 'line_total', 'created_at')


class OrderItemCreateSerializer(serializers.Serializer):
    variant = serializers.UUIDField(required=False, allow_null=True)
    product_name = serializers.CharField(max_length=200, required=False, allow_blank=False)
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)

    def validate(self, attrs: dict) -> dict:
        if not attrs.get('variant'):
            if not attrs.get('product_name'):
                raise serializers.ValidationError({
                    'product_name': "Le nom est requis pour une ligne libre.",
                })
            if attrs.get('unit_price') is None:
                raise serializers.ValidationError({
                    'unit_price': "Le prix est requis pour une ligne libre.",
                })
        return attrs


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'order_number', 'status', 'status_display',
            'payment_status', 'payment_status_display',
            'customer', 'customer_name', 'customer_phone',
            'subtotal', 'discount_amount', 'shipping_amount', 'total_amount', 'amount_paid',
            'stock_reserved',
            'items', 'created_at', 'updated_at', 'cancelled_at',
        )
        read_only_fields = (
            'id', 'order_number', 'subtotal', 'total_amount',
            'stock_reserved', 'created_at', 'updated_at', 'cancelled_at',
        )


class OrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    item_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'order_number', 'status', 'status_display',
            'payment_status', 'payment_status_display',
            'customer', 'customer_name',
            'total_amount', 'amount_paid',
            'item_count', 'created_at',
        )


class OrderCreateSerializer(serializers.Serializer):
    customer = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    shipping_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    items = OrderItemCreateSerializer(many=True, required=True)
    status = serializers.ChoiceField(
        choices=['draft', 'to_prepare', 'prepared', 'shipped'], required=False, default='draft',
    )
    payment_status = serializers.ChoiceField(
        choices=['unpaid', 'partial', 'paid'], required=False, default='unpaid',
    )
    amount_paid = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=Decimal('0'), min_value=Decimal('0'),
    )

    def validate_items(self, value: list) -> list:
        if not value:
            raise serializers.ValidationError('La commande doit contenir au moins un article.')
        return value

    def validate(self, attrs: dict) -> dict:
        if attrs.get('payment_status') == 'partial' and attrs.get('amount_paid', Decimal('0')) <= 0:
            raise serializers.ValidationError({
                'amount_paid': 'Le montant reçu doit être supérieur à 0 pour un paiement partiel.',
            })
        return attrs


class OrderItemQuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class StatusTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['draft', 'to_prepare', 'prepared', 'shipped', 'cancelled'])


class PaymentUpdateSerializer(serializers.Serializer):
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
