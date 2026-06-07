from __future__ import annotations

from rest_framework import serializers

from apps.core.storage import get_signed_url, is_storage_configured
from apps.products.models import Product

from .models import ContactButton, PublicCatalogVisibility, PublicPage, PublicPageSection


def _signed_url_or_none(object_key: str) -> str | None:
    """Helper partagé : URL signée à 1h si le key existe et le stockage est OK, sinon None."""
    if not object_key or not is_storage_configured():
        return None
    return get_signed_url(object_key)


class PublicPageSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicPageSection
        fields = ('id', 'type', 'position', 'is_visible', 'title', 'content', 'updated_at')
        read_only_fields = ('id', 'updated_at')


class PublicCatalogVisibilitySerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(source='product.id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_type = serializers.CharField(source='product.type', read_only=True)

    class Meta:
        model = PublicCatalogVisibility
        fields = (
            'id', 'product', 'product_id', 'product_name', 'product_type',
            'position', 'show_price', 'badge_promo', 'badge_new',
        )
        read_only_fields = ('id',)

    def validate_product(self, product: Product) -> Product:
        # Multi-tenant : le produit doit appartenir à la même boutique que la page.
        page: PublicPage = self.context['page']
        if product.shop_id != page.shop_id:
            raise serializers.ValidationError('Ce produit n\'appartient pas à cette boutique.')
        return product


class ContactButtonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactButton
        fields = (
            'id', 'type', 'value', 'label', 'is_primary',
            'is_visible', 'position',
        )
        read_only_fields = ('id',)

    def validate_value(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Valeur requise.')
        return value


class PublicPageSerializer(serializers.ModelSerializer):
    """Représentation complète de la page pour l'admin (lecture).

    Inclut sections, catalog et contacts pour permettre au frontend de
    construire son éditeur en une seule requête.
    """

    is_live = serializers.BooleanField(read_only=True)
    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()
    sections = PublicPageSectionSerializer(many=True, read_only=True)
    catalog_items = PublicCatalogVisibilitySerializer(many=True, read_only=True)
    contact_buttons = ContactButtonSerializer(many=True, read_only=True)

    class Meta:
        model = PublicPage
        fields = (
            'id', 'slug', 'is_active', 'is_published', 'is_live',
            'display_name', 'tagline', 'description',
            'logo_object_key', 'logo_url', 'cover_object_key', 'cover_url',
            'theme', 'primary_color',
            'order_message_template',
            'published_at', 'created_at', 'updated_at',
            'sections', 'catalog_items', 'contact_buttons',
        )
        read_only_fields = (
            'id', 'is_live', 'logo_object_key', 'logo_url',
            'cover_object_key', 'cover_url',
            'published_at', 'created_at', 'updated_at',
            'sections', 'catalog_items', 'contact_buttons',
        )

    def get_logo_url(self, obj: PublicPage) -> str | None:
        return _signed_url_or_none(obj.logo_object_key)

    def get_cover_url(self, obj: PublicPage) -> str | None:
        return _signed_url_or_none(obj.cover_object_key)


class PublicPageCreateSerializer(serializers.Serializer):
    """Création initiale : seuls le slug et le nom affiché sont requis.

    Les sections par défaut sont créées côté service. Tout le reste sera
    paramétré via `PATCH` ensuite.
    """

    slug = serializers.CharField(max_length=50)
    display_name = serializers.CharField(max_length=120, required=False, allow_blank=True)


class PublicPageUpdateSerializer(serializers.ModelSerializer):
    """PATCH des infos de premier niveau de la page."""

    class Meta:
        model = PublicPage
        fields = (
            'slug', 'is_active',
            'display_name', 'tagline', 'description',
            'theme', 'primary_color',
            'order_message_template',
        )
        extra_kwargs = {field: {'required': False} for field in fields}


class ReorderEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    position = serializers.IntegerField(min_value=0)


class ReorderSerializer(serializers.Serializer):
    order = ReorderEntrySerializer(many=True)
