from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db.models import (
    Case, DecimalField, Exists, F, Min, OuterRef, Q, QuerySet, Subquery, Sum, Value,
    When,
)
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from apps.core.storage import get_signed_url, upload_fileobj

from .models import Product, ProductVariant

if TYPE_CHECKING:
    from apps.products.models import ProductImage
    from apps.shops.models import Shop


__all__ = (
    'upload_product_image', 'get_signed_url', 'PRODUCT_SEARCH_FIELDS',
    'products_with_stats', 'filter_products', 'build_product_facets',
    'build_products_summary',
)

PRODUCT_SEARCH_FIELDS = ('name', 'variants__sku', 'variants__barcode')
TYPES = ('product', 'service')
STATES = ('active', 'inactive', 'all')

_QUANTITY = DecimalField(max_digits=16, decimal_places=3)
_IS_ARTICLE = Q(type='product')

# Niveaux de stock d'un article, exclusifs : rupture, stock faible, en stock.
# Rupture = aucun format actif avec du stock ; faible = un format actif sous son seuil.
STOCK_LEVELS: dict[str, Q] = {
    'out': _IS_ARTICLE & Q(has_stock=False),
    'low': _IS_ARTICLE & Q(has_low=True),
    'in': _IS_ARTICLE & Q(has_stock=True, has_low=False),
}


def _active_variants() -> QuerySet[ProductVariant]:
    return ProductVariant.objects.filter(product=OuterRef('pk'), is_active=True)


def _per_product(aggregate) -> Subquery:
    """Agrégat des formats actifs d'un article, en sous-requête.

    Pas de jointure : la recherche porte aussi sur les formats (référence,
    code-barres), une jointure multiplierait les sommes.
    """
    rows = _active_variants().values('product').annotate(value=aggregate)
    return Subquery(rows.values('value')[:1])


def products_with_stats(shop: 'Shop') -> QuerySet[Product]:
    """Articles et services de la boutique, annotés pour le tri et les filtres.

    `min_price` : plus petit prix des formats actifs ; `total_stock` : stock total
    des formats actifs, `None` pour un service (en fin de liste au tri).
    """
    return Product.objects.filter(shop=shop).annotate(
        min_price=_per_product(Min('selling_price')),
        total_stock=Case(
            When(
                _IS_ARTICLE,
                then=Coalesce(
                    _per_product(Sum('stock_quantity')), Value(0),
                    output_field=_QUANTITY,
                ),
            ),
            default=None,
            output_field=_QUANTITY,
        ),
        has_stock=Exists(_active_variants().filter(stock_quantity__gt=0)),
        has_low=Exists(
            _active_variants().filter(
                low_stock_threshold__isnull=False,
                stock_quantity__gt=0,
                stock_quantity__lte=F('low_stock_threshold'),
            ),
        ),
    )


def _state(params: Mapping[str, str]) -> str:
    """État demandé ; `inactive=1` et `all=1` restent acceptés (anciens appels)."""
    state = params.get('state')
    if state in STATES:
        return state
    if params.get('inactive') == '1':
        return 'inactive'
    return 'all' if params.get('all') == '1' else 'active'


def _stock_level(params: Mapping[str, str]) -> str | None:
    """Niveau de stock demandé ; `out_of_stock=1` et `low_stock=1` restent acceptés."""
    level = params.get('stock')
    if level in STOCK_LEVELS:
        return level
    if params.get('out_of_stock') == '1':
        return 'out'
    return 'low' if params.get('low_stock') == '1' else None


def filter_products(
    qs: QuerySet[Product], params: Mapping[str, str], *, skip: str | None = None,
) -> QuerySet[Product]:
    """Filtres de la liste Articles (état, type, stock), hors recherche.

    `qs` vient de `products_with_stats`. Sans `state`, seuls les actifs sont
    renvoyés (sélecteurs d'article de la commande, du stock). `skip` ignore un
    filtre : c'est ce que comptent les facettes de ce filtre.
    """
    if skip != 'state':
        state = _state(params)
        if state != 'all':
            qs = qs.filter(is_active=state == 'active')
    if skip != 'type' and params.get('type') in TYPES:
        qs = qs.filter(type=params['type'])
    if skip != 'stock':
        level = _stock_level(params)
        if level:
            qs = qs.filter(STOCK_LEVELS[level])
    return qs


def build_product_facets(qs: QuerySet[Product], params: Mapping[str, str]) -> dict:
    """Nombre d'articles par option de chaque filtre, avec tous les autres filtres.

    `qs` doit déjà être annoté (`products_with_stats`) et limité à la recherche.
    """
    by_state = filter_products(qs, params, skip='state')
    by_type = filter_products(qs, params, skip='type')
    by_stock = filter_products(qs, params, skip='stock')
    return {
        'state': {
            'all': by_state.count(),
            'active': by_state.filter(is_active=True).count(),
            'inactive': by_state.filter(is_active=False).count(),
        },
        'type': {
            'all': by_type.count(),
            **{kind: by_type.filter(type=kind).count() for kind in TYPES},
        },
        'stock': {
            'all': by_stock.count(),
            **{level: by_stock.filter(q).count() for level, q in STOCK_LEVELS.items()},
        },
    }


def build_products_summary(shop: 'Shop') -> dict:
    """Indicateurs du Catalogue (articles et services actifs, rupture, stock faible)."""
    qs = products_with_stats(shop)
    active = qs.filter(is_active=True)
    products = active.filter(_IS_ARTICLE).count()
    services = active.filter(type='service').count()
    return {
        'total': products + services,
        'products': products,
        'services': services,
        'out_of_stock': active.filter(STOCK_LEVELS['out']).count(),
        'low_stock': active.filter(STOCK_LEVELS['low']).count(),
        'inactive': qs.filter(is_active=False).count(),
    }


def upload_product_image(shop: 'Shop', product_id: str, file: InMemoryUploadedFile) -> 'ProductImage':  # noqa: E501
    from apps.products.models import ProductImage

    max_bytes = getattr(settings, 'PRODUCT_IMAGE_MAX_SIZE_MB', 5) * 1024 * 1024
    allowed_types: set[str] = getattr(settings, 'PRODUCT_IMAGE_ALLOWED_TYPES', {'image/jpeg', 'image/png', 'image/webp'})  # noqa: E501

    if file.size > max_bytes:
        raise ValidationError(f"L'image ne doit pas dépasser {max_bytes // (1024 * 1024)} Mo.")  # noqa: E501

    if file.content_type not in allowed_types:
        raise ValidationError(f"Type de fichier non autorisé : {file.content_type}. Formats acceptés : JPEG, PNG, WebP.")  # noqa: E501

    product = Product.objects.get(pk=product_id, shop=shop)

    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'jpg'
    object_key = f"products/{shop.pk}/{product_id}/{uuid.uuid4()}.{ext}"

    upload_fileobj(file, object_key, file.content_type)

    # La photo envoyée devient la principale : « Remplacer la photo » (fiche,
    # formulaire) change bien ce qui est affiché. Les précédentes restent attachées.
    with transaction.atomic():
        images = ProductImage.objects.filter(product=product)
        position = images.count()
        images.filter(is_primary=True).update(is_primary=False)
        return ProductImage.objects.create(
            shop=shop, product=product, object_key=object_key,
            is_primary=True, position=position,
        )
