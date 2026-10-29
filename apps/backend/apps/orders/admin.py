from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import Order, OrderItem


class OrderItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("id", "created_at")


@admin.register(Order)
class OrderAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule : statut, paiement et lignes passent par `orders.services`
    (stock réservé, AuditLog). Ni suppression ni annulation ici."""

    list_display = (
        "order_number",
        "shop",
        "customer",
        "status",
        "payment_status",
        "total_amount",
        "created_at",
    )
    list_filter = ("status", "payment_status", "shop")
    search_fields = ("order_number", "customer__name")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (OrderItemInline,)
