from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import IntegrityError, transaction
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db.models import (
    Case, DecimalField, Exists, F, Max, Min, OuterRef, Q, QuerySet, Subquery, Sum,
    Value, When,
)
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.images import validate_uploaded_image
from apps.core.storage import (
    delete_object, download_bytes, get_signed_url, upload_fileobj,
)

from .constants import DEFAULT_VARIANT_NAME
from .models import Product, ProductVariant

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.products.models import ProductImage
    from apps.shops.models import Shop


__all__ = (
    'upload_product_image', 'set_primary_image', 'delete_product_image',
    'replace_image_file', 'read_image_file', 'PRODUCT_IMAGE_MAX_COUNT',
    'get_signed_url', 'PRODUCT_SEARCH_FIELDS', 'served_variant_ids',
    'is_last_active_variant', 'LAST_ACTIVE_VARIANT_MESSAGE',
    'products_with_stats', 'filter_products', 'build_product_facets',
    'build_products_summary', 'create_product', 'create_variant', 'product_has_served',
    'delete_unused_product', 'ProductInUseError', 'INITIAL_STOCK_REASON',
    'delete_unused_variant', 'VariantInUseError', 'update_product', 'sync_variants',
    'product_stock_totals', 'product_sales', 'SALES_DAYS',
    'create_service_from_line', 'ProductNameTakenError',
)

PRODUCT_SEARCH_FIELDS = ('name', 'variants__sku', 'variants__barcode')
TYPES = ('product', 'service')
STATES = ('active', 'inactive', 'all')

_QUANTITY = DecimalField(max_digits=16, decimal_places=3)
_IS_ARTICLE = Q(type='product')

# Niveaux de stock d'un article, exclusifs : négatif, rupture, stock faible, en stock.
# Négatif = un format actif sous zéro (à régulariser) ; rupture = aucun format actif
# avec du stock ; faible = un format actif sous son seuil.
_NOT_NEGATIVE = _IS_ARTICLE & Q(has_negative=False)
STOCK_LEVELS: dict[str, Q] = {
    'negative': _IS_ARTICLE & Q(has_negative=True),
    'out': _NOT_NEGATIVE & Q(has_stock=False),
    'low': _NOT_NEGATIVE & Q(has_low=True),
    'in': _NOT_NEGATIVE & Q(has_stock=True, has_low=False),
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
        has_negative=Exists(_active_variants().filter(stock_quantity__lt=0)),
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
    """Indicateurs du Catalogue (actifs, négatif, rupture, stock faible)."""
    qs = products_with_stats(shop)
    active = qs.filter(is_active=True)
    products = active.filter(_IS_ARTICLE).count()
    services = active.filter(type='service').count()
    return {
        'total': products + services,
        'products': products,
        'services': services,
        'negative_stock': active.filter(STOCK_LEVELS['negative']).count(),
        'out_of_stock': active.filter(STOCK_LEVELS['out']).count(),
        'low_stock': active.filter(STOCK_LEVELS['low']).count(),
        'inactive': qs.filter(is_active=False).count(),
    }


# ─── Photos d'un article ────────────────────────────────────────────────────

PRODUCT_IMAGE_MAX_COUNT = 8
# Extension de l'objet déduite du type vérifié, jamais du nom de fichier envoyé.
_IMAGE_EXTENSIONS = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}
_IMAGE_TYPES = {ext: content_type for content_type, ext in _IMAGE_EXTENSIONS.items()}


def _store_image_file(product: Product, file: InMemoryUploadedFile) -> str:
    """Vérifie le type et la taille, envoie le fichier au bucket privé, renvoie sa clé."""  # noqa: E501
    max_bytes = getattr(settings, 'PRODUCT_IMAGE_MAX_SIZE_MB', 5) * 1024 * 1024
    allowed_types: set[str] = getattr(settings, 'PRODUCT_IMAGE_ALLOWED_TYPES', set(_IMAGE_EXTENSIONS))  # noqa: E501

    if file.size > max_bytes:
        raise ValidationError(f"L'image ne doit pas dépasser {max_bytes // (1024 * 1024)} Mo.")  # noqa: E501
    if file.content_type not in allowed_types or file.content_type not in _IMAGE_EXTENSIONS:  # noqa: E501
        raise ValidationError("Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WebP.")  # noqa: E501
    validate_uploaded_image(file)

    ext = _IMAGE_EXTENSIONS[file.content_type]
    object_key = f"products/{product.shop_id}/{product.pk}/{uuid.uuid4()}.{ext}"
    upload_fileobj(file, object_key, file.content_type)
    return object_key


def upload_product_image(shop: 'Shop', product_id: str, file: InMemoryUploadedFile) -> 'ProductImage':  # noqa: E501
    from apps.products.models import ProductImage

    product = Product.objects.get(pk=product_id, shop=shop)
    if ProductImage.objects.filter(product=product).count() >= PRODUCT_IMAGE_MAX_COUNT:  # noqa: E501
        raise ValidationError(f"Un article a au plus {PRODUCT_IMAGE_MAX_COUNT} photos.")  # noqa: E501
    object_key = _store_image_file(product, file)

    # La photo envoyée devient la principale : elle remplace ce qui est affiché.
    # Les précédentes restent attachées, à la suite.
    with transaction.atomic():
        images = ProductImage.objects.filter(product=product)
        last = images.aggregate(last=Max('position'))['last']
        images.filter(is_primary=True).update(is_primary=False)
        return ProductImage.objects.create(
            shop=shop, product=product, object_key=object_key,
            is_primary=True, position=0 if last is None else last + 1,
        )


def set_primary_image(image: 'ProductImage') -> None:
    """La photo devient la photo principale de son article (une seule à la fois)."""
    from apps.products.models import ProductImage

    with transaction.atomic():
        others = ProductImage.objects.filter(product_id=image.product_id)
        others.exclude(pk=image.pk).update(is_primary=False)
        if not image.is_primary:
            image.is_primary = True
            image.save(update_fields=['is_primary'])


def delete_product_image(image: 'ProductImage') -> None:
    """Retire la photo ; si c'était la principale, la suivante (par position) la
    remplace. Le fichier est supprimé du bucket une fois la transaction validée."""
    from apps.products.models import ProductImage

    object_key = image.object_key
    with transaction.atomic():
        was_primary = image.is_primary
        product_id = image.product_id
        image.delete()
        if was_primary:
            following = ProductImage.objects.filter(product_id=product_id).first()
            if following is not None:
                set_primary_image(following)
        transaction.on_commit(lambda: delete_object(object_key))


def replace_image_file(image: 'ProductImage', file: InMemoryUploadedFile) -> 'ProductImage':  # noqa: E501
    """Remplace le fichier d'une photo (recadrage) : même place, même statut."""
    old_key = image.object_key
    image.object_key = _store_image_file(image.product, file)
    image.save(update_fields=['object_key'])
    delete_object(old_key)
    return image


def read_image_file(image: 'ProductImage') -> tuple[bytes, str]:
    """Contenu et type d'une photo, servis par l'API (même origine que l'app) pour
    être recadrés dans le navigateur."""
    ext = image.object_key.rsplit('.', 1)[-1].lower()
    return download_bytes(image.object_key), _IMAGE_TYPES.get(ext, 'application/octet-stream')  # noqa: E501


# ─── Création et suppression d'un article ───────────────────────────────────

# Motif du stock saisi à la création (affiché dans l'historique). Le stock
# initial se reconnaît à `StockMovement.is_initial`, jamais à ce texte.
INITIAL_STOCK_REASON = 'Stock initial'


class ProductInUseError(Exception):
    """Article déjà utilisé (commande, mouvement) : à désactiver, pas à supprimer."""

    def __init__(self) -> None:
        super().__init__('Cet article a déjà servi : désactivez-le plutôt.')


class VariantInUseError(Exception):
    """Format déjà utilisé (commande, mouvement) : à retirer de la vente."""

    def __init__(self) -> None:
        super().__init__('Ce format a déjà servi : retirez-le de la vente.')


def create_product(
    shop: Shop,
    user: User,
    data: Mapping[str, object],
    variants: Sequence[Mapping[str, object]] = (),
) -> Product:
    """Article et ses formats en une transaction, tout ou rien.

    Le stock initial d'un format (`initial_stock` de sa ligne, articles
    seulement) passe par une entrée de stock, au prix d'achat du format.
    La limite de la formule est vérifiée dans la même transaction.
    """
    from apps.subscriptions.limits import enforce_product_limit

    with transaction.atomic():
        enforce_product_limit(shop)
        product = Product.objects.create(shop=shop, **data)
        if variants:
            _check_variant_rows(product, variants, current={})
        for position, row in enumerate(variants):
            _create_variant_row(product, user, row, position)
    return product


class ProductNameTakenError(Exception):
    """Un article de ce nom existe déjà : le proposer plutôt qu'un doublon."""

    def __init__(self, product_id: uuid.UUID) -> None:
        self.product_id = product_id
        super().__init__('Un article de ce nom existe déjà.')


def create_service_from_line(
    shop: Shop,
    *,
    name: str,
    unit_label: str,
    unit_price_ht: Decimal,
) -> Product:
    """Service du catalogue créé depuis une ligne de facture libre (URS-110).

    Un seul format, au nom par défaut, au prix HT de la ligne. Le nom déjà pris
    (sans tenir compte de la casse) renvoie l'article existant, jamais un doublon,
    y compris en cas de création concurrente (contrainte `unique_product_name_per_shop`).
    """  # noqa: E501
    from apps.subscriptions.limits import enforce_product_limit

    def existing() -> ProductNameTakenError:
        found = Product.objects.filter(shop=shop, name__iexact=name).values_list('pk', flat=True).first()  # noqa: E501
        return ProductNameTakenError(found)

    with transaction.atomic():
        enforce_product_limit(shop)
        if Product.objects.filter(shop=shop, name__iexact=name).exists():
            raise existing()
        try:
            with transaction.atomic():
                product = Product.objects.create(shop=shop, name=name, type='service')
        except IntegrityError:
            raise existing() from None
        ProductVariant.objects.create(
            shop=shop, product=product, packaging_name=DEFAULT_VARIANT_NAME,
            unit='piece', base_quantity=Decimal('1'), unit_label=unit_label,
            selling_price=unit_price_ht, position=0,
        )
    return product


def create_variant(
    product: Product,
    user: User,
    data: Mapping[str, object],
    initial_stock: Decimal | None = None,
) -> ProductVariant:
    """Nouveau format et son stock initial en une transaction, tout ou rien.

    Le stock initial (articles seulement) passe par une entrée de stock, au
    prix d'achat du format.
    """
    from apps.stock.services import create_movement

    with transaction.atomic():
        variant = ProductVariant.objects.create(shop=product.shop, product=product, **data)  # noqa: E501
        if initial_stock and product.type == 'product':
            create_movement(
                product.shop, variant, 'in', initial_stock, reason=INITIAL_STOCK_REASON,  # noqa: E501
                created_by=user, unit_purchase_price=variant.purchase_price,
                is_initial=True,
            )
    return variant


_INITIAL_MOVEMENT = Q(is_initial=True)


def _variants_have_served(variants: QuerySet[ProductVariant]) -> bool:
    """Une ligne de commande, ou un mouvement autre que le stock initial."""
    from apps.orders.models import OrderItem
    from apps.stock.models import StockMovement

    if OrderItem.objects.filter(variant__in=variants).exists():
        return True
    movements = StockMovement.objects.filter(variant__in=variants)
    return movements.exclude(_INITIAL_MOVEMENT).exists()


def _delete_unused_variants(variants: QuerySet[ProductVariant]) -> None:
    """Verrouille les formats, vérifie qu'ils n'ont jamais servi, puis supprime
    leur stock initial (seul historique restant). À appeler dans une transaction.

    Le verrou fait attendre une vente ou une entrée en cours la fin de la
    vérification.
    """
    from apps.stock.models import StockMovement

    list(variants.select_for_update())
    if _variants_have_served(variants):
        raise ProductInUseError()
    StockMovement.objects.filter(variant__in=variants).delete()


def served_variant_ids(product: Product) -> set[uuid.UUID]:
    """Formats de l'article qui ont déjà servi (ligne de commande, mouvement
    autre que le stock initial) : ils se retirent de la vente, sans suppression."""
    from apps.orders.models import OrderItem
    from apps.stock.models import StockMovement

    variants = ProductVariant.objects.filter(product=product)
    ordered = OrderItem.objects.filter(variant__in=variants)
    moved = StockMovement.objects.filter(variant__in=variants).exclude(_INITIAL_MOVEMENT)  # noqa: E501
    return {
        *ordered.values_list('variant_id', flat=True),
        *moved.values_list('variant_id', flat=True),
    }


LAST_ACTIVE_VARIANT_MESSAGE = (
    "C'est le dernier format en vente de cet article : désactivez plutôt l'article."
)


def is_last_active_variant(variant: ProductVariant) -> bool:
    """Format actif sans autre format actif : le retirer rendrait l'article invendable."""  # noqa: E501
    others = ProductVariant.objects.filter(
        product_id=variant.product_id, is_active=True
    ).exclude(pk=variant.pk)
    return variant.is_active and not others.exists()


def product_has_served(product: Product) -> bool:
    """Une ligne de commande, ou un mouvement autre que son stock initial."""
    return _variants_have_served(ProductVariant.objects.filter(product=product))


def delete_unused_product(product: Product) -> None:
    """Supprime un article qui n'a jamais servi, avec son stock initial ;
    sinon `ProductInUseError`."""
    with transaction.atomic():
        _delete_unused_variants(ProductVariant.objects.filter(product=product))
        product.delete()


def delete_unused_variant(variant: ProductVariant) -> None:
    """Supprime un format qui n'a jamais servi, avec son stock initial ;
    sinon `VariantInUseError` (le retirer de la vente)."""
    with transaction.atomic():
        try:
            _delete_unused_variants(ProductVariant.objects.filter(pk=variant.pk))
        except ProductInUseError:
            raise VariantInUseError() from None
        variant.delete()


# ─── Tableau des formats du formulaire article ──────────────────────────────

# Champs d'un format existant que le tableau modifie ; l'unité et le contenu
# sont définitifs, le stock ne change que par des mouvements.
_ROW_FIELDS = (
    'packaging_name', 'selling_price', 'purchase_price', 'low_stock_threshold',
    'sku', 'barcode', 'is_active',
)


def _create_variant_row(
    product: Product, user: User, row: Mapping[str, object], position: int,
) -> ProductVariant:
    data = {k: v for k, v in row.items() if k not in ('id', 'initial_stock')}
    data.setdefault('position', position)
    return create_variant(product, user, data, row.get('initial_stock'))


def _row_errors(
    product: Product,
    rows: Sequence[Mapping[str, object]],
    current: Mapping[uuid.UUID, ProductVariant],
) -> dict[int, dict[str, list[str]]]:
    """Lignes invalides au regard de la base : format d'un autre article, stock
    initial sur un format existant, référence prise par un autre article."""
    skus = {row['sku'] for row in rows if row.get('sku')}
    taken = set(
        ProductVariant.objects.filter(shop=product.shop, sku__in=skus)
        .exclude(product=product).values_list('sku', flat=True)
    )
    errors: dict[int, dict[str, list[str]]] = {}
    seen: set[object] = set()
    for index, row in enumerate(rows):
        row_id = row.get('id')
        if row_id and (row_id not in current or row_id in seen):
            errors[index] = {'id': ["Ce format n'appartient pas à cet article."]}
        elif row_id and row.get('initial_stock'):
            errors[index] = {'initial_stock': [
                "Le stock d'un format existant change par une entrée de stock.",
            ]}
        elif row.get('sku') in taken:
            errors[index] = {'sku': ['Cette référence est déjà utilisée par un autre article.']}  # noqa: E501
        seen.add(row_id)
    return errors


def _check_variant_rows(
    product: Product,
    rows: Sequence[Mapping[str, object]],
    current: Mapping[uuid.UUID, ProductVariant],
) -> None:
    """Refuse le tableau entier si une ligne est invalide ou si aucun format ne
    reste en vente (l'article serait invendable)."""
    errors = _row_errors(product, rows, current)
    if errors:
        raise ValidationError({'variants': errors})

    def active(row: Mapping[str, object]) -> bool:
        known = current.get(row['id']) if row.get('id') else None
        return bool(row.get('is_active', known.is_active if known else True))

    if not any(active(row) for row in rows):
        raise ValidationError({'variants': [LAST_ACTIVE_VARIANT_MESSAGE]})


def _remove_variants(product: Product, variants: list[ProductVariant]) -> None:
    """Supprime les formats retirés du tableau ; refuse ceux qui ont déjà servi."""
    served = served_variant_ids(product)
    refused = [v.packaging_name for v in variants if v.pk in served]
    if refused:
        raise ValidationError({'variants': [
            f'« {name} » a déjà servi : retirez-le de la vente plutôt que de le supprimer.'  # noqa: E501
            for name in refused
        ]})
    removed = ProductVariant.objects.filter(pk__in=[v.pk for v in variants])
    try:
        _delete_unused_variants(removed)
    except ProductInUseError:
        raise ValidationError({'variants': [str(VariantInUseError())]}) from None
    removed.delete()


def _update_variant_rows(
    rows: Sequence[Mapping[str, object]], current: Mapping[uuid.UUID, ProductVariant],
) -> None:
    """Modifie les formats existants. Les noms et références qui changent sont
    d'abord libérés : deux formats peuvent échanger leurs noms."""
    updates = [
        (current[row['id']], row, position)
        for position, row in enumerate(rows) if row.get('id')
    ]
    for variant, row, _ in updates:
        if row['packaging_name'] != variant.packaging_name:
            variant.packaging_name = f'~{variant.pk}'
        if row.get('sku', variant.sku) != variant.sku:
            variant.sku = ''
    ProductVariant.objects.bulk_update([u[0] for u in updates], ['packaging_name', 'sku'])  # noqa: E501
    for variant, row, position in updates:
        for field in _ROW_FIELDS:
            if field in row:
                setattr(variant, field, row[field])
        variant.position = position
        # Jamais `stock_quantity` : il ne change que par les mouvements.
        variant.save(update_fields=[*_ROW_FIELDS, 'position', 'updated_at'])


def sync_variants(
    product: Product, user: User, rows: Sequence[Mapping[str, object]],
) -> None:
    """Aligne les formats de l'article sur le tableau du formulaire, tout ou rien.

    Ligne avec `id` : format modifié ; sans `id` : format créé avec son stock
    initial ; format absent du tableau : supprimé s'il n'a jamais servi, sinon
    refus (le retirer de la vente). L'ordre du tableau devient celui des formats.
    """
    with transaction.atomic():
        current = {
            v.pk: v
            for v in ProductVariant.objects.select_for_update().filter(product=product)
        }
        _check_variant_rows(product, rows, current)
        kept = {row.get('id') for row in rows}
        removed = [v for pk, v in current.items() if pk not in kept]
        if removed:
            _remove_variants(product, removed)
        _update_variant_rows(rows, current)
        for position, row in enumerate(rows):
            if not row.get('id'):
                _create_variant_row(product, user, row, position)


def update_product(
    product: Product,
    user: User,
    data: Mapping[str, object],
    variants: Sequence[Mapping[str, object]] | None = None,
) -> Product:
    """Informations de l'article et, avec `variants`, ses formats : une transaction.

    Réactiver l'article (`is_active` à vrai) reprend un slot de la formule.
    """
    from apps.subscriptions.limits import enforce_product_limit

    with transaction.atomic():
        if data.get('is_active') and not product.is_active:
            enforce_product_limit(product.shop, reactivating=product)
        for field, value in data.items():
            setattr(product, field, value)
        product.save()
        if variants is not None:
            sync_variants(product, user, variants)
    return product


def reactivate_product(product: Product) -> None:
    """Remet l'article en vente, dans la limite d'articles actifs de la formule."""
    from apps.subscriptions.limits import enforce_product_limit

    with transaction.atomic():
        enforce_product_limit(product.shop, reactivating=product)
        product.is_active = True
        product.save(update_fields=['is_active', 'updated_at'])


SALES_DAYS = 30
_CENT = Decimal('0.01')


def product_stock_totals(product: Product) -> dict[str, Decimal | None]:
    """Stock total des formats actifs (négatifs compris) et valeur d'achat.

    La valeur d'achat suit les niveaux de stock : stock positif × prix d'achat,
    `None` si aucun format n'a de prix. Tout est `None` pour un service. Lit
    les formats déjà chargés (`prefetch_related('variants')`).
    """
    if product.type != 'product':
        return {'quantity': None, 'purchase_value': None}
    variants = [v for v in product.variants.all() if v.is_active]
    quantity = sum((v.stock_quantity for v in variants), Decimal('0'))
    priced = [v for v in variants if v.purchase_price is not None]
    if not priced:
        return {'quantity': quantity, 'purchase_value': None}
    value = sum(
        (max(v.stock_quantity, Decimal('0')) * v.purchase_price for v in priced),
        Decimal('0'),
    )
    return {'quantity': quantity, 'purchase_value': value.quantize(_CENT)}


def product_sales(product: Product, days: int = SALES_DAYS) -> dict[str, Decimal | int]:  # noqa: E501
    """Quantité et montant des lignes vendues sur les `days` derniers jours.

    Commandes annulées exclues ; montant des lignes, avant remise de commande.
    """
    from apps.orders.models import OrderItem

    since = timezone.now() - timedelta(days=days)
    totals = (
        OrderItem.objects
        .filter(
            shop_id=product.shop_id, variant__product=product,
            order__created_at__gte=since,
        )
        .exclude(order__status='cancelled')
        .aggregate(
            quantity=Coalesce(Sum('quantity'), 0),
            amount=Coalesce(
                Sum('line_total'), Value(Decimal('0')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )
    )
    return {'quantity': totals['quantity'], 'amount': totals['amount'].quantize(_CENT)}
