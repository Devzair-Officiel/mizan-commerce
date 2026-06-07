"""Logique métier de la page publique.

Toute la logique non triviale autour de `PublicPage` et ses sous-ressources
vit ici : création initiale avec sections par défaut, publication/dépublication,
normalisation du slug, gestion de l'unicité du bouton de contact principal.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.core.storage import delete_object, upload_fileobj

from .models import (
    RESERVED_SLUGS,
    ContactButton,
    PublicCatalogVisibility,
    PublicPage,
    PublicPageSection,
)

if TYPE_CHECKING:
    from apps.shops.models import Shop

# Limites de taille — la cover est plus large (paysage) que le logo.
PUBLIC_PAGE_LOGO_MAX_SIZE_MB = 5
PUBLIC_PAGE_COVER_MAX_SIZE_MB = 8
PUBLIC_PAGE_IMAGE_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


# Sections créées automatiquement lors de la création initiale de la page —
# l'ordre est significatif (URS-073 : reorderable côté admin ensuite).
DEFAULT_SECTIONS: tuple[tuple[str, int], ...] = (
    (PublicPageSection.Type.HEADER, 0),
    (PublicPageSection.Type.DESCRIPTION, 1),
    (PublicPageSection.Type.PRODUCTS, 2),
    (PublicPageSection.Type.SERVICES, 3),
    (PublicPageSection.Type.CONTACT, 4),
)


def normalize_slug(raw: str) -> str:
    """Slugify standard + lowercase. La validation regex est faite côté field."""
    return slugify(raw or '').lower()[:50]


def suggest_slug_for(shop: 'Shop') -> str:
    """Slug pré-rempli à l'activation : slugify(nom de boutique).

    Fallback `boutique` si la slugification renvoie une chaîne vide.
    Le suffixe -2, -3… est appliqué si le slug est déjà pris ailleurs.
    """
    base = normalize_slug(shop.name) or 'boutique'
    if base in RESERVED_SLUGS:
        base = f'{base}-shop'

    candidate = base
    counter = 2
    while PublicPage.objects.filter(slug=candidate).exists():
        suffix = f'-{counter}'
        candidate = f'{base[: 50 - len(suffix)]}{suffix}'
        counter += 1
    return candidate


def validate_slug(slug: str, *, exclude_page: PublicPage | None = None) -> str:
    """Valide qu'un slug est utilisable : non réservé, unique en base.

    La validation regex est laissée au field validator du modèle.
    Lève `ValidationError` si invalide.
    """
    normalized = (slug or '').strip().lower()
    if not normalized:
        raise ValidationError({'slug': 'Slug requis.'})
    if normalized in RESERVED_SLUGS:
        raise ValidationError({'slug': f"Le slug « {normalized} » est réservé."})
    qs = PublicPage.objects.filter(slug=normalized)
    if exclude_page is not None:
        qs = qs.exclude(pk=exclude_page.pk)
    if qs.exists():
        raise ValidationError({'slug': 'Ce slug est déjà utilisé.'})
    return normalized


@transaction.atomic
def create_public_page(*, shop: 'Shop', slug: str, display_name: str = '') -> PublicPage:
    """Crée la page publique d'une boutique avec ses sections par défaut.

    URS-070 : l'activation est explicite (un POST de l'admin). On crée la
    page en `is_active=False` + `is_published=False` ; l'admin doit ensuite
    activer puis publier.
    """
    if PublicPage.objects.filter(shop=shop).exists():
        raise ValidationError({'detail': 'Cette boutique a déjà une page publique.'})

    normalized = validate_slug(slug)
    page = PublicPage.objects.create(
        shop=shop,
        slug=normalized,
        display_name=display_name or shop.name,
        is_active=False,
        is_published=False,
    )
    PublicPageSection.objects.bulk_create([
        PublicPageSection(page=page, type=section_type, position=position)
        for section_type, position in DEFAULT_SECTIONS
    ])
    return page


@transaction.atomic
def update_public_page(*, page: PublicPage, data: dict) -> PublicPage:
    """Mise à jour partielle des champs de premier niveau de la page.

    Le slug, s'il est passé, est revalidé (unicité + réservé). Les autres
    champs sont appliqués tels quels (la validation de format est faite par
    les validators sur le modèle).
    """
    slug = data.pop('slug', None)
    if slug is not None and slug != page.slug:
        page.slug = validate_slug(slug, exclude_page=page)

    for field, value in data.items():
        setattr(page, field, value)
    page.save()
    return page


@transaction.atomic
def publish_page(page: PublicPage) -> PublicPage:
    """Passe la page en publié (URS-077). Active aussi `is_active` si besoin :
    publier implique être visible publiquement."""
    page.is_active = True
    page.is_published = True
    if page.published_at is None:
        page.published_at = timezone.now()
    page.save(update_fields=['is_active', 'is_published', 'published_at', 'updated_at'])
    return page


@transaction.atomic
def unpublish_page(page: PublicPage) -> PublicPage:
    """Repasse la page en brouillon. `is_active` n'est pas touché : un admin
    peut vouloir garder la page activée mais retirée temporairement (404)."""
    page.is_published = False
    page.save(update_fields=['is_published', 'updated_at'])
    return page


@transaction.atomic
def set_primary_contact(*, page: PublicPage, contact: ContactButton) -> ContactButton:
    """Garantit qu'un seul bouton est `is_primary=True` sur la page.

    Réinitialise les autres avant de marquer celui demandé. Utilisé après
    création ou patch d'un bouton avec `is_primary=True` côté serializer.
    """
    ContactButton.objects.filter(page=page).exclude(pk=contact.pk).update(is_primary=False)
    if not contact.is_primary:
        contact.is_primary = True
        contact.save(update_fields=['is_primary', 'updated_at'])
    return contact


def _upload_page_image(
    *,
    page: PublicPage,
    file: InMemoryUploadedFile,
    kind: str,
    max_size_mb: int,
) -> PublicPage:
    """Pattern partagé entre logo et cover : valide, push, écrase l'ancien.

    `kind` est utilisé pour nommer le fichier et choisir le champ à mettre à jour
    (`logo_object_key` ou `cover_object_key`).
    """
    max_bytes = max_size_mb * 1024 * 1024
    if file.size > max_bytes:
        raise ValidationError(f"L'image ne doit pas dépasser {max_size_mb} Mo.")
    if file.content_type not in PUBLIC_PAGE_IMAGE_ALLOWED_TYPES:
        raise ValidationError(
            f"Type de fichier non autorisé : {file.content_type}. Formats acceptés : JPEG, PNG, WebP.",
        )
    if not settings.AWS_S3_ENDPOINT_URL or not settings.AWS_ACCESS_KEY_ID:
        raise ValidationError("L'upload vers Object Storage n'est pas configuré sur cet environnement.")

    field = f'{kind}_object_key'
    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'jpg'
    new_key = f"public_pages/{page.pk}/{kind}-{uuid.uuid4()}.{ext}"

    upload_fileobj(file, new_key, file.content_type)

    old_key = getattr(page, field)
    setattr(page, field, new_key)
    page.save(update_fields=[field, 'updated_at'])

    if old_key and old_key != new_key:
        delete_object(old_key)

    return page


def upload_page_logo(page: PublicPage, file: InMemoryUploadedFile) -> PublicPage:
    return _upload_page_image(
        page=page, file=file, kind='logo',
        max_size_mb=PUBLIC_PAGE_LOGO_MAX_SIZE_MB,
    )


def upload_page_cover(page: PublicPage, file: InMemoryUploadedFile) -> PublicPage:
    return _upload_page_image(
        page=page, file=file, kind='cover',
        max_size_mb=PUBLIC_PAGE_COVER_MAX_SIZE_MB,
    )


def _delete_page_image(*, page: PublicPage, kind: str) -> PublicPage:
    field = f'{kind}_object_key'
    old_key = getattr(page, field)
    setattr(page, field, '')
    page.save(update_fields=[field, 'updated_at'])
    if old_key:
        delete_object(old_key)
    return page


def delete_page_logo(page: PublicPage) -> PublicPage:
    return _delete_page_image(page=page, kind='logo')


def delete_page_cover(page: PublicPage) -> PublicPage:
    return _delete_page_image(page=page, kind='cover')


@transaction.atomic
def reorder_sections(*, page: PublicPage, order: list[dict]) -> None:
    """Applique un nouvel ordre aux sections.

    `order` est une liste `[{'id': uuid, 'position': int}, …]`. Toutes les
    sections doivent appartenir à la page. Toute incohérence lève 400.
    """
    section_ids = [entry['id'] for entry in order]
    sections = {s.id: s for s in PublicPageSection.objects.filter(page=page, id__in=section_ids)}
    if len(sections) != len(section_ids):
        raise ValidationError({'detail': 'Certaines sections sont introuvables sur cette page.'})

    for entry in order:
        section = sections[entry['id']]
        section.position = entry['position']
    PublicPageSection.objects.bulk_update(sections.values(), ['position'])


@transaction.atomic
def reorder_catalog(*, page: PublicPage, order: list[dict]) -> None:
    """Pendant `reorder_sections` pour `PublicCatalogVisibility`."""
    item_ids = [entry['id'] for entry in order]
    items = {i.id: i for i in PublicCatalogVisibility.objects.filter(page=page, id__in=item_ids)}
    if len(items) != len(item_ids):
        raise ValidationError({'detail': 'Certains éléments sont introuvables sur cette page.'})

    for entry in order:
        item = items[entry['id']]
        item.position = entry['position']
    PublicCatalogVisibility.objects.bulk_update(items.values(), ['position'])
