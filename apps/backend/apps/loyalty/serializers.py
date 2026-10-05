from rest_framework import serializers
from .models import LoyaltyCard, LoyaltyProgram, LoyaltyTransaction


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = (
            'is_active', 'points_per_unit', 'redemption_threshold',
            'redemption_value', 'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')


class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyTransaction
        fields = (
            'id', 'transaction_type', 'points', 'order', 'note',
            'created_by', 'created_at',
        )
        read_only_fields = ('id', 'created_at')


class LoyaltyCardListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)

    class Meta:
        model = LoyaltyCard
        fields = ('id', 'customer', 'customer_name', 'customer_phone', 'points_balance', 'created_at')  # noqa: E501


class LoyaltyCardSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)

    class Meta:
        model = LoyaltyCard
        fields = (
            'id', 'customer', 'customer_name', 'customer_phone',
            'points_balance', 'total_points_earned', 'total_points_redeemed',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'points_balance', 'total_points_earned', 'total_points_redeemed',
            'created_at', 'updated_at',
        )


class EarnPointsSerializer(serializers.Serializer):
    points = serializers.IntegerField(min_value=1)
    note = serializers.CharField(max_length=255, required=False, default='')
    order_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class RedeemPointsSerializer(serializers.Serializer):
    points = serializers.IntegerField(min_value=1)
    order_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class AdjustPointsSerializer(serializers.Serializer):
    delta = serializers.IntegerField()
    note = serializers.CharField(max_length=255)

    def validate_delta(self, value: int) -> int:
        if value == 0:
            raise serializers.ValidationError('Le delta ne peut pas être nul.')
        return value
