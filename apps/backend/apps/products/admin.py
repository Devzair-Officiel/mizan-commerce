from django.contrib import admin
from .models import Product, ProductImage


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    readonly_fields = ('id', 'created_at')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'reference', 'shop', 'selling_price', 'stock_quantity', 'is_active', 'updated_at')
    list_filter = ('is_active', 'shop')
    search_fields = ('name', 'reference')
    readonly_fields = ('id', 'stock_quantity', 'created_at', 'updated_at')
    inlines = (ProductImageInline,)
