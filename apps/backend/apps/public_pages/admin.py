from django.contrib import admin

from .models import ContactButton, PublicCatalogVisibility, PublicPage, PublicPageSection


@admin.register(PublicPage)
class PublicPageAdmin(admin.ModelAdmin):
    list_display = ('slug', 'shop', 'is_active', 'is_published', 'theme', 'updated_at')
    list_filter = ('is_active', 'is_published', 'theme')
    search_fields = ('slug', 'shop__name', 'display_name')
    readonly_fields = ('id', 'created_at', 'updated_at', 'published_at')


@admin.register(PublicPageSection)
class PublicPageSectionAdmin(admin.ModelAdmin):
    list_display = ('page', 'type', 'position', 'is_visible')
    list_filter = ('type', 'is_visible')
    search_fields = ('page__slug',)


@admin.register(PublicCatalogVisibility)
class PublicCatalogVisibilityAdmin(admin.ModelAdmin):
    list_display = ('page', 'product', 'position', 'show_price', 'badge_promo', 'badge_new')
    list_filter = ('badge_promo', 'badge_new', 'show_price')
    search_fields = ('page__slug', 'product__name')


@admin.register(ContactButton)
class ContactButtonAdmin(admin.ModelAdmin):
    list_display = ('page', 'type', 'value', 'is_primary', 'is_visible', 'position')
    list_filter = ('type', 'is_primary', 'is_visible')
    search_fields = ('page__slug', 'value')
