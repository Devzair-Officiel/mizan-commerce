from decimal import Decimal, InvalidOperation
from rest_framework import serializers
from .models import ZakatCalculation


VALID_DEBT_CATEGORIES = {'supplier', 'tax_vat', 'salary', 'loan', 'rent', 'other'}
VALID_EXCLUDED_ITEMS = {'vehicle', 'computer', 'machine', 'premises', 'furniture', 'other'}
VALID_STOCK_CATEGORIES = {'finished', 'raw_materials', 'work_in_progress', 'in_transit'}
VALID_RECEIVABLE_CATEGORIES = {'certain', 'probable', 'doubtful'}


class DebtItemSerializer(serializers.Serializer):
    """Item de ventilation des dettes — validé avant stockage JSON."""
    category = serializers.ChoiceField(choices=sorted(VALID_DEBT_CATEGORIES))
    label = serializers.CharField(max_length=200, allow_blank=True, default='')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    is_immediately_due = serializers.BooleanField(default=True)


class StockBreakdownItemSerializer(serializers.Serializer):
    """Item de ventilation du stock par catégorie comptable."""
    category = serializers.ChoiceField(choices=sorted(VALID_STOCK_CATEGORIES))
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))


class ReceivableBreakdownItemSerializer(serializers.Serializer):
    """Item de ventilation des créances par classe de recouvrabilité.

    `doubtful` est conservée pour mémoire mais exclue du `receivables_amount` zakatable.
    """
    category = serializers.ChoiceField(choices=sorted(VALID_RECEIVABLE_CATEGORIES))
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))


class ZakatCalculationSerializer(serializers.ModelSerializer):
    stock_value_for_base = serializers.SerializerMethodField()
    is_above_nisab = serializers.SerializerMethodField()
    debts_breakdown = serializers.ListField(
        child=DebtItemSerializer(), required=False, default=list,
    )
    stock_breakdown = serializers.ListField(
        child=StockBreakdownItemSerializer(), required=False, default=list,
    )
    receivables_breakdown = serializers.ListField(
        child=ReceivableBreakdownItemSerializer(), required=False, default=list,
    )
    excluded_items_acknowledged = serializers.ListField(
        child=serializers.ChoiceField(choices=sorted(VALID_EXCLUDED_ITEMS)),
        required=False, default=list,
    )

    class Meta:
        model = ZakatCalculation
        fields = [
            'id', 'status', 'current_step', 'reference_date',
            'cash_amount',
            'has_receivables', 'receivables_nominal', 'receivables_breakdown', 'receivables_amount',
            'stock_value_estimated', 'stock_breakdown', 'stock_value_adjusted', 'stock_value_for_base',
            'excluded_items_acknowledged',
            'debts_breakdown', 'short_term_debts',
            'zakat_base', 'zakat_rate', 'zakat_amount',
            'nisab_method', 'nisab_unit_price', 'nisab_threshold', 'is_above_nisab',
            'currency', 'pdf_object_key', 'notes',
            'finalized_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status',
            'stock_value_estimated', 'stock_value_for_base',
            'short_term_debts',
            'zakat_base', 'zakat_amount',
            'nisab_method', 'nisab_unit_price', 'nisab_threshold', 'is_above_nisab',
            'currency', 'pdf_object_key',
            'finalized_at', 'created_at', 'updated_at',
        ]

    def get_stock_value_for_base(self, obj: ZakatCalculation) -> str:
        return str(obj.stock_value_for_base)

    def get_is_above_nisab(self, obj: ZakatCalculation) -> bool | None:
        return obj.is_above_nisab

    def to_internal_value(self, data):
        """Sérialise les `Decimal` des ventilations en string avant stockage JSON
        (JSONField n'accepte pas `Decimal` natif).
        """
        validated = super().to_internal_value(data)
        for key in ('debts_breakdown', 'stock_breakdown', 'receivables_breakdown'):
            if key in validated:
                validated[key] = [
                    {**item, 'amount': str(item['amount'])}
                    for item in validated[key]
                ]
        return validated


class ZakatStockEstimateSerializer(serializers.Serializer):
    stock_value_estimated = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    currency = serializers.CharField(read_only=True)
    disclaimer = serializers.CharField(read_only=True)
    product_count = serializers.IntegerField(read_only=True)


def coerce_decimal(value, default: str = '0') -> Decimal:
    """Helper utilisé par la vue legacy de création directe."""
    if value in (None, ''):
        return Decimal(default)
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return Decimal(default)
