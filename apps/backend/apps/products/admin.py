from django.contrib import admin
from .models import Product, ProductImage, ProductVariant


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    readonly_fields = ('id', 'created_at')


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    readonly_fields = ('id', 'stock_quantity', 'created_at', 'updated_at')
    fields = ('packaging_name', 'unit', 'base_quantity', 'selling_price', 'purchase_price', 'stock_quantity', 'sku', 'is_active')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'shop', 'type', 'is_active', 'updated_at')
    list_filter = ('is_active', 'type', 'shop')
    search_fields = ('name', 'variants__sku')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = (ProductVariantInline, ProductImageInline)
