from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ('id', 'product', 'product_name', 'unit_price', 'quantity', 'line_total', 'created_at')
        read_only_fields = ('id', 'product_name', 'line_total', 'created_at')


class OrderItemCreateSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'order_number', 'status', 'status_display',
            'payment_status', 'payment_status_display',
            'customer', 'customer_name',
            'subtotal', 'discount_amount', 'shipping_amount', 'total_amount', 'amount_paid',
            'notes', 'stock_reserved',
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
    notes = serializers.CharField(required=False, default='')
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    shipping_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    items = OrderItemCreateSerializer(many=True, required=False, default=list)


class StatusTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['to_prepare', 'prepared', 'shipped', 'cancelled'])


class PaymentUpdateSerializer(serializers.Serializer):
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
