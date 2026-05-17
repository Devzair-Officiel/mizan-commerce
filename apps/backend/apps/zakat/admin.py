from django.contrib import admin
from .models import ZakatCalculation


@admin.register(ZakatCalculation)
class ZakatCalculationAdmin(admin.ModelAdmin):
    list_display = ('shop', 'reference_date', 'zakat_base', 'zakat_amount', 'currency', 'created_at')
    list_filter = ('shop',)
    readonly_fields = ('id', 'stock_value_estimated', 'zakat_base', 'zakat_amount', 'currency', 'created_at', 'updated_at')
