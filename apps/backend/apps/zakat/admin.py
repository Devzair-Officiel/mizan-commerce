from django.contrib import admin
from .models import ZakatCalculation, ZakatProfile, ZakatReceivableFollowUp


@admin.register(ZakatCalculation)
class ZakatCalculationAdmin(admin.ModelAdmin):
    list_display = ('shop', 'user', 'hawl_year', 'reference_date', 'currency', 'updated_at')  # noqa: E501
    list_filter = ('shop',)
    readonly_fields = (
        'id', 'user', 'hawl_calendar', 'hawl_year', 'version', 'choices_snapshot',
        'stock_sale_value', 'stock_purchase_value', 'paid_on', 'paid_amount',
        'currency', 'created_at', 'updated_at',
    )


@admin.register(ZakatProfile)
class ZakatProfileAdmin(admin.ModelAdmin):
    list_display = ('shop', 'user', 'calendar', 'updated_at')
    readonly_fields = ('id', 'nisab_price_updated_at', 'created_at', 'updated_at')


@admin.register(ZakatReceivableFollowUp)
class ZakatReceivableFollowUpAdmin(admin.ModelAdmin):
    list_display = ('shop', 'user', 'calculation', 'doubtful_option', 'updated_at')
    list_filter = ('shop',)
    readonly_fields = (
        'id', 'shop', 'user', 'calculation', 'line_id', 'doubtful_option',
        'collected_amount', 'collected_on', 'paid_amount', 'last_paid_amount',
        'last_paid_at', 'ignored_at', 'created_at', 'updated_at',
    )
