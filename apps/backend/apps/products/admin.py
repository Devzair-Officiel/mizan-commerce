from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import Product, ProductImage, ProductVariant


class ProductImageInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = ProductImage
    extra = 0
    readonly_fields = ("id", "created_at")


class ProductVariantInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = (
        "packaging_name",
        "unit",
        "base_quantity",
        "selling_price",
        "purchase_price",
        "stock_quantity",
        "sku",
        "is_active",
    )


@admin.register(Product)
class ProductAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("name", "shop", "type", "is_active", "updated_at")
    list_filter = ("is_active", "type", "shop")
    search_fields = ("name", "variants__sku")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (ProductVariantInline, ProductImageInline)


@admin.register(ProductVariant)
class ProductVariantAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule : `stock_quantity` est dérivée des StockMovement."""

    list_display = (
        "product",
        "packaging_name",
        "shop",
        "selling_price",
        "stock_quantity",
        "sku",
        "is_active",
    )
    list_filter = ("is_active",)
    search_fields = ("product__name", "packaging_name", "sku", "barcode")
    readonly_fields = ("id", "created_at", "updated_at")
