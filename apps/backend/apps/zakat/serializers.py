from rest_framework import serializers
from .models import ZakatCalculation


class ZakatCalculationSerializer(serializers.ModelSerializer):
    stock_value_display = serializers.SerializerMethodField()

    class Meta:
        model = ZakatCalculation
        fields = [
            'id', 'reference_date',
            'stock_value_estimated', 'stock_value_adjusted', 'stock_value_display',
            'cash_amount', 'receivables_amount', 'short_term_debts',
            'zakat_base', 'zakat_rate', 'zakat_amount',
            'currency', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'stock_value_estimated', 'zakat_base', 'zakat_amount',
            'currency', 'created_at', 'updated_at',
        ]

    def get_stock_value_display(self, obj) -> str:
        value = obj.stock_value_adjusted if obj.stock_value_adjusted is not None else obj.stock_value_estimated
        return f'{value} {obj.currency} (estimation indicative)'


class ZakatStockEstimateSerializer(serializers.Serializer):
    stock_value_estimated = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    currency = serializers.CharField(read_only=True)
    disclaimer = serializers.CharField(read_only=True)
    product_count = serializers.IntegerField(read_only=True)
