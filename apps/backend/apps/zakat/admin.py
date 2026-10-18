from django.contrib import admin
from .models import ZakatCalculation, ZakatProfile


@admin.register(ZakatCalculation)
class ZakatCalculationAdmin(admin.ModelAdmin):
    list_display = ('shop', 'user', 'hawl_year', 'reference_date', 'currency', 'updated_at')  # noqa: E501
    list_filter = ('shop',)
    readonly_fields = (
        'id', 'user', 'hawl_calendar', 'hawl_year', 'version', 'choices_snapshot',
        'stock_sale_value', 'stock_purchase_value', 'currency',
        'created_at', 'updated_at',
    )


@admin.register(ZakatProfile)
class ZakatProfileAdmin(admin.ModelAdmin):
    list_display = ('shop', 'user', 'calendar', 'updated_at')
    readonly_fields = ('id', 'nisab_price_updated_at', 'created_at', 'updated_at')
