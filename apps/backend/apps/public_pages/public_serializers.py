"""Sérialiseurs pour la page publique (lecture seule, non authentifiée).

Distincts des sérialiseurs admin pour ne jamais exposer de champ sensible
(slugs réservés, JSONFields techniques, IDs des sous-ressources cachées).
Seul ce qui s'affiche sur la vitrine est sérialisé.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.core.storage import get_signed_url, is_storage_configured
from apps.products.models import Product

from .models import ContactButton, PublicCatalogVisibility, PublicPage, PublicPageSection


def _signed_url_or_none(object_key: str) -> str | None:
    if not object_key or not is_storage_configured():
        return None
    return get_signed_url(object_key, expires_in=3600)


class PublicCatalogItemSerializer(serializers.ModelSerializer):
    """Représentation publique d'un produit/service exposé sur la vitrine.

    Le prix est dérivé de la première variante active (par position) — pour
    V3 on n'expose pas les variantes individuelles, le client final
    contacte ensuite le commerçant pour finaliser.
    """

    name = serializers.CharField(source='product.name', read_only=True)
    description = serializers.CharField(source='product.description', read_only=True)
    type = serializers.CharField(source='product.type', read_only=True)
    price = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()

    class Meta:
        model = PublicCatalogVisibility
        fields = (
            'id', 'name', 'description', 'type',
            'price', 'image_url',
            'show_price', 'badge_promo', 'badge_new', 'is_out_of_stock',
            'position',
        )

    def _first_active_variant(self, product: Product):
        return product.variants.filter(is_active=True).order_by('position', 'created_at').first()

    def get_price(self, obj: PublicCatalogVisibility) -> str | None:
        if not obj.show_price:
            return None
        variant = self._first_active_variant(obj.product)
        return str(variant.selling_price) if variant else None

    def get_image_url(self, obj: PublicCatalogVisibility) -> str | None:
        image = obj.product.images.order_by('-is_primary', 'position').first()
        return _signed_url_or_none(image.object_key) if image else None

    def get_is_out_of_stock(self, obj: PublicCatalogVisibility) -> bool:
        variant = self._first_active_variant(obj.product)
        return bool(variant and variant.is_out_of_stock)


class PublicContactButtonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactButton
        fields = ('id', 'type', 'value', 'label', 'is_primary', 'position')


class PublicSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicPageSection
        fields = ('id', 'type', 'position', 'title', 'content')


class PublicPageReadSerializer(serializers.ModelSerializer):
    """Page publique complète, prête à être rendue côté frontend."""

    currency = serializers.CharField(source='shop.currency', read_only=True)
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()
    sections = serializers.SerializerMethodField()
    products = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    contacts = serializers.SerializerMethodField()
    primary_contact = serializers.SerializerMethodField()

    class Meta:
        model = PublicPage
        fields = (
            'slug', 'display_name', 'tagline', 'description',
            'theme', 'primary_color',
            'is_published',
            'order_message_template',
            'shop_name', 'currency',
            'logo_url', 'cover_url',
            'sections', 'products', 'services', 'contacts', 'primary_contact',
        )

    def get_logo_url(self, obj: PublicPage) -> str | None:
        return _signed_url_or_none(obj.logo_object_key)

    def get_cover_url(self, obj: PublicPage) -> str | None:
        return _signed_url_or_none(obj.cover_object_key)

    def get_sections(self, obj: PublicPage) -> list[dict]:
        # Seules les sections visibles sont exposées publiquement.
        sections = obj.sections.filter(is_visible=True).order_by('position')
        return PublicSectionSerializer(sections, many=True).data

    def _catalog(self, obj: PublicPage, product_type: str) -> list[dict]:
        items = (
            obj.catalog_items
            .filter(product__type=product_type, product__is_active=True)
            .select_related('product')
            .prefetch_related('product__variants', 'product__images')
            .order_by('position')
        )
        return PublicCatalogItemSerializer(items, many=True).data

    def get_products(self, obj: PublicPage) -> list[dict]:
        return self._catalog(obj, 'product')

    def get_services(self, obj: PublicPage) -> list[dict]:
        return self._catalog(obj, 'service')

    def get_contacts(self, obj: PublicPage) -> list[dict]:
        contacts = obj.contact_buttons.filter(is_visible=True).order_by('position')
        return PublicContactButtonSerializer(contacts, many=True).data

    def get_primary_contact(self, obj: PublicPage) -> dict | None:
        contact = obj.contact_buttons.filter(is_visible=True, is_primary=True).first()
        return PublicContactButtonSerializer(contact).data if contact else None
