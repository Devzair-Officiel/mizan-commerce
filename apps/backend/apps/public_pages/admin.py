from django.contrib import admin
from django.forms import ModelForm
from django.http import HttpRequest

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import (
    ContactButton,
    PublicCatalogVisibility,
    PublicPage,
    PublicPageSection,
)
from .services import moderate_page


class PublicPageSectionInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = PublicPageSection
    extra = 0
    fields = ('type', 'position', 'is_visible', 'title')


class PublicCatalogVisibilityInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = PublicCatalogVisibility
    extra = 0
    fields = ('product', 'position', 'show_price', 'badge_promo', 'badge_new')


class ContactButtonInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = ContactButton
    extra = 0
    fields = ('type', 'value', 'label', 'is_primary', 'is_visible', 'position')


@admin.register(PublicPage)
class PublicPageAdmin(admin.ModelAdmin):
    """Modération : seuls `is_active` et `is_published` sont modifiables, via
    `moderate_page` (trace AuditLog). Ni ajout ni suppression."""

    list_display = ('slug', 'shop', 'is_active', 'is_published', 'theme', 'updated_at')
    list_filter = ('is_active', 'is_published', 'theme')
    search_fields = ('slug', 'shop__name', 'display_name')
    fields = (
        'id',
        'shop',
        'slug',
        'is_active',
        'is_published',
        'display_name',
        'tagline',
        'description',
        'theme',
        'primary_color',
        'published_at',
        'created_at',
        'updated_at',
    )
    readonly_fields = (
        'id',
        'shop',
        'slug',
        'display_name',
        'tagline',
        'description',
        'theme',
        'primary_color',
        'published_at',
        'created_at',
        'updated_at',
    )
    inlines = (
        PublicPageSectionInline,
        PublicCatalogVisibilityInline,
        ContactButtonInline,
    )

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_delete_permission(
        self, request: HttpRequest, obj: PublicPage | None = None
    ) -> bool:
        return False

    def save_model(
        self, request: HttpRequest, obj: PublicPage, form: ModelForm, change: bool
    ) -> None:
        # Le formulaire ne porte que les deux interrupteurs : le service les enregistre.
        moderate_page(
            page=obj,
            is_active=obj.is_active,
            is_published=obj.is_published,
            actor=request.user,
        )
