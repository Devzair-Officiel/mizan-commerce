from django.contrib import admin
from .models import ZakatCalculation


@admin.register(ZakatCalculation)
class ZakatCalculationAdmin(admin.ModelAdmin):
    list_display = ('shop', 'reference_date', 'status', 'zakat_base', 'zakat_amount', 'currency', 'updated_at')
    list_filter = ('shop', 'status')
    readonly_fields = (
        'id', 'stock_value_estimated', 'short_term_debts',
        'zakat_base', 'zakat_amount', 'currency',
        'finalized_at', 'created_at', 'updated_at',
    )
