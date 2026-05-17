from django.contrib import admin
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('id', 'product_name', 'line_total', 'created_at')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('order_number', 'shop', 'customer', 'status', 'payment_status', 'total_amount', 'created_at')
    list_filter = ('status', 'payment_status', 'shop')
    search_fields = ('order_number', 'customer__name')
    readonly_fields = ('id', 'order_number', 'subtotal', 'total_amount', 'stock_reserved', 'created_at', 'updated_at', 'cancelled_at')
    inlines = (OrderItemInline,)
