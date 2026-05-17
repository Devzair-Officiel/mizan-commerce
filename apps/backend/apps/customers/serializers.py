from rest_framework import serializers
from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    order_count = serializers.IntegerField(read_only=True, default=0)
    pending_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=0)

    class Meta:
        model = Customer
        fields = (
            'id', 'name', 'phone', 'email',
            'address_line', 'city', 'postal_code', 'country',
            'notes', 'is_active',
            'order_count', 'pending_amount',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class CustomerListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ('id', 'name', 'phone', 'email', 'city', 'is_active', 'created_at')
