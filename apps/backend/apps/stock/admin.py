from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import StockMovement


@admin.register(StockMovement)
class StockMovementAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule : toute écriture passe par `stock.services.create_movement()`."""

    list_display = (
        "variant",
        "shop",
        "movement_type",
        "quantity",
        "reason",
        "created_by",
        "created_at",
    )
    list_filter = ("movement_type", "shop")
    search_fields = ("variant__product__name", "variant__packaging_name", "reason")
    readonly_fields = ("id", "created_at")
