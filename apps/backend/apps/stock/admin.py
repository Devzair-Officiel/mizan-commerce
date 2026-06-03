from django.contrib import admin
from .models import StockMovement


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('variant', 'shop', 'movement_type', 'quantity', 'reason', 'created_by', 'created_at')
    list_filter = ('movement_type', 'shop')
    search_fields = ('variant__product__name', 'variant__packaging_name', 'reason')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('variant', 'created_by')
