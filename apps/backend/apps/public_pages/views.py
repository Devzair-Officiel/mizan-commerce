"""Vues admin du module page publique.

Toutes les vues sont admin-only (`IsShopAdmin`). La page publique est un
singleton par boutique : pas d'ID dans l'URL pour la page elle-même. Les
sous-ressources (sections, catalog, contacts) sont scopées à la page de la
boutique courante via `_get_page()`.
"""

from __future__ import annotations

from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_shop_from_request
from apps.subscriptions.permissions import HasPlanForFeature

from .models import ContactButton, PublicCatalogVisibility, PublicPage, PublicPageSection

HasPublicPagesPlan = HasPlanForFeature.for_feature('public_pages')
from .serializers import (
    ContactButtonSerializer,
    PublicCatalogVisibilitySerializer,
    PublicPageCreateSerializer,
    PublicPageSectionSerializer,
    PublicPageSerializer,
    PublicPageUpdateSerializer,
    ReorderSerializer,
)
from .services import (
    create_public_page,
    delete_page_cover,
    delete_page_logo,
    publish_page,
    reorder_catalog,
    reorder_sections,
    set_primary_contact,
    suggest_slug_for,
    unpublish_page,
    update_public_page,
    upload_page_cover,
    upload_page_logo,
)


class _PublicPageMixin:
    """Récupère la page publique de la boutique courante.

    Lève 404 si aucune page n'a encore été créée (URS-070 : l'activation est
    un acte explicite, la page n'existe pas par défaut).
    """

    permission_classes = (IsAuthenticated, HasPublicPagesPlan, IsShopAdmin)

    def _get_page(self) -> PublicPage:
        shop = get_shop_from_request(self.request)  # type: ignore[attr-defined]
        try:
            return PublicPage.objects.get(shop=shop)
        except PublicPage.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Aucune page publique pour cette boutique.')


class PublicPageView(_PublicPageMixin, APIView):
    """GET / POST / PATCH sur la page singleton de la boutique courante."""

    def get(self, request) -> Response:
        # Pas de 404 ici : on renvoie aussi un slug suggéré pour permettre
        # au frontend d'afficher l'écran d'activation pré-rempli.
        shop = get_shop_from_request(request)
        try:
            page = PublicPage.objects.prefetch_related(
                'sections', 'catalog_items', 'catalog_items__product', 'contact_buttons',
            ).get(shop=shop)
        except PublicPage.DoesNotExist:
            return Response({
                'exists': False,
                'suggested_slug': suggest_slug_for(shop),
                'suggested_display_name': shop.name,
            })
        return Response({'exists': True, 'page': PublicPageSerializer(page).data})

    def post(self, request) -> Response:
        shop = get_shop_from_request(request)
        serializer = PublicPageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = create_public_page(
            shop=shop,
            slug=serializer.validated_data['slug'],
            display_name=serializer.validated_data.get('display_name', ''),
        )
        page = PublicPage.objects.prefetch_related(
            'sections', 'catalog_items', 'catalog_items__product', 'contact_buttons',
        ).get(pk=page.pk)
        return Response(PublicPageSerializer(page).data, status=status.HTTP_201_CREATED)

    def patch(self, request) -> Response:
        page = self._get_page()
        serializer = PublicPageUpdateSerializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        page = update_public_page(page=page, data=serializer.validated_data)
        page = PublicPage.objects.prefetch_related(
            'sections', 'catalog_items', 'catalog_items__product', 'contact_buttons',
        ).get(pk=page.pk)
        return Response(PublicPageSerializer(page).data)


class _PageImageView(_PublicPageMixin, APIView):
    """Mutualise POST (upload) et DELETE (remove) sur les champs image de la page."""

    parser_classes = (MultiPartParser,)
    field_name: str = ''  # 'logo' ou 'cover' — surchargé par les sous-classes

    def _refresh_serialized(self, page: PublicPage) -> Response:
        page = PublicPage.objects.prefetch_related(
            'sections', 'catalog_items', 'catalog_items__product', 'contact_buttons',
        ).get(pk=page.pk)
        return Response(PublicPageSerializer(page).data)

    def post(self, request) -> Response:
        page = self._get_page()
        file = request.FILES.get(self.field_name)
        if not file:
            return Response(
                {'detail': f'Champ « {self.field_name} » requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._do_upload(page=page, file=file)
        return self._refresh_serialized(page)

    def delete(self, request) -> Response:
        page = self._get_page()
        self._do_delete(page=page)
        return self._refresh_serialized(page)

    def _do_upload(self, *, page: PublicPage, file) -> None:
        raise NotImplementedError

    def _do_delete(self, *, page: PublicPage) -> None:
        raise NotImplementedError


class PageLogoView(_PageImageView):
    field_name = 'logo'

    def _do_upload(self, *, page: PublicPage, file) -> None:
        upload_page_logo(page=page, file=file)

    def _do_delete(self, *, page: PublicPage) -> None:
        delete_page_logo(page=page)


class PageCoverView(_PageImageView):
    field_name = 'cover'

    def _do_upload(self, *, page: PublicPage, file) -> None:
        upload_page_cover(page=page, file=file)

    def _do_delete(self, *, page: PublicPage) -> None:
        delete_page_cover(page=page)


class PublishView(_PublicPageMixin, APIView):
    def post(self, request) -> Response:
        page = publish_page(self._get_page())
        return Response(PublicPageSerializer(page).data)


class UnpublishView(_PublicPageMixin, APIView):
    def post(self, request) -> Response:
        page = unpublish_page(self._get_page())
        return Response(PublicPageSerializer(page).data)


# ── Sections ────────────────────────────────────────────────────────


class SectionListCreateView(_PublicPageMixin, generics.ListCreateAPIView):
    serializer_class = PublicPageSectionSerializer

    def get_queryset(self):
        return PublicPageSection.objects.filter(page=self._get_page())

    def perform_create(self, serializer):
        serializer.save(page=self._get_page())


class SectionDetailView(_PublicPageMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PublicPageSectionSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        return PublicPageSection.objects.filter(page=self._get_page())


class SectionReorderView(_PublicPageMixin, APIView):
    def post(self, request) -> Response:
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reorder_sections(page=self._get_page(), order=serializer.validated_data['order'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Catalogue ───────────────────────────────────────────────────────


class CatalogListCreateView(_PublicPageMixin, generics.ListCreateAPIView):
    serializer_class = PublicCatalogVisibilitySerializer

    def get_queryset(self):
        return PublicCatalogVisibility.objects.filter(page=self._get_page()).select_related('product')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['page'] = self._get_page()
        return ctx

    def perform_create(self, serializer):
        serializer.save(page=self._get_page())


class CatalogDetailView(_PublicPageMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PublicCatalogVisibilitySerializer
    lookup_field = 'pk'

    def get_queryset(self):
        return PublicCatalogVisibility.objects.filter(page=self._get_page())

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['page'] = self._get_page()
        return ctx


class CatalogReorderView(_PublicPageMixin, APIView):
    def post(self, request) -> Response:
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reorder_catalog(page=self._get_page(), order=serializer.validated_data['order'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Boutons de contact ──────────────────────────────────────────────


class ContactListCreateView(_PublicPageMixin, generics.ListCreateAPIView):
    serializer_class = ContactButtonSerializer

    def get_queryset(self):
        return ContactButton.objects.filter(page=self._get_page())

    def perform_create(self, serializer):
        page = self._get_page()
        contact = serializer.save(page=page)
        if contact.is_primary:
            set_primary_contact(page=page, contact=contact)


class ContactDetailView(_PublicPageMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ContactButtonSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        return ContactButton.objects.filter(page=self._get_page())

    def perform_update(self, serializer):
        contact = serializer.save()
        if contact.is_primary:
            set_primary_contact(page=self._get_page(), contact=contact)
