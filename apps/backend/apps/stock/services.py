from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import TYPE_CHECKING, NamedTuple
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import (
    Case, CharField, Count, DecimalField, F, OuterRef, Q, QuerySet, Subquery, Sum,
    Value, When,
)
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.orders.models import Order
from apps.products.models import ProductVariant

from .models import EXIT_TYPES, MOVEMENT_SIGNS, StockMovement

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.ocr.models import OcrResult
    from apps.shops.models import Shop

__all__ = [
    'EntryLine', 'EntryReference', 'ExitLine', 'InsufficientStockError',
    'LEVEL_SEARCH_FIELDS', 'MOVEMENT_SEARCH_FIELDS', 'STOCK_STATES',
    'adjust_to_count', 'adjust_to_counts', 'CountLine', 'build_level_facets',
    'build_levels_summary',
    'create_entry', 'create_exit', 'create_movement', 'filter_levels',
    'filter_movements', 'load_stock_variants', 'movements_with_references',
    'stock_levels',
]

VALID_TYPES: frozenset[str] = frozenset(MOVEMENT_SIGNS.keys())

_QUANTITY = DecimalField(max_digits=16, decimal_places=3)
_MONEY = DecimalField(max_digits=28, decimal_places=5)
_CENT = Decimal('0.01')


class InsufficientStockError(ValueError):
    """Sortie manuelle au-delà du stock disponible.

    Une vente, elle, n'est jamais bloquée par le stock.
    """

    def __init__(self, available: Decimal) -> None:
        self.available = max(available, Decimal('0'))
        super().__init__(
            f'Stock insuffisant : {self.available.normalize():f} disponible(s).'
        )


class EntryReference(NamedTuple):
    """Fournisseur et facture attachés aux mouvements d'une entrée (facultatifs)."""
    supplier_name: str = ''
    invoice_number: str = ''
    invoice_date: dt.date | None = None
    ocr_result: OcrResult | None = None


class EntryLine(NamedTuple):
    variant: ProductVariant
    quantity: Decimal
    unit_purchase_price: Decimal | None = None


class ExitLine(NamedTuple):
    variant: ProductVariant
    quantity: Decimal


class CountLine(NamedTuple):
    variant: ProductVariant
    counted: Decimal


def create_movement(
    shop: Shop,
    variant: ProductVariant,
    movement_type: str,
    quantity: Decimal | int,
    reason: str = '',
    order_id: uuid.UUID | None = None,
    created_by: User | None = None,
    *,
    reference: EntryReference | None = None,
    unit_purchase_price: Decimal | None = None,
    limit_to_available: bool = False,
    is_initial: bool = False,
) -> StockMovement:
    """
    Point d'entrée unique pour créer un mouvement de stock.

    Pré-conditions vérifiées :
    - type de mouvement valide
    - quantité > 0 (sauf pour 'adjustment' où elle est signée)
    - variante de la même boutique
    - variante liée à un article (pas un service)

    La ligne du format est verrouillée (`select_for_update`) le temps du
    mouvement : la vérification `limit_to_available` (sorties manuelles) lit
    donc un stock que personne ne modifie en parallèle. Sans ce drapeau, le
    stock peut devenir négatif (réservation d'une commande).
    """
    if movement_type not in VALID_TYPES:
        raise ValueError(f"Type de mouvement invalide : {movement_type!r}.")

    qty = Decimal(str(quantity))
    if movement_type != 'adjustment' and qty <= 0:
        raise ValueError("La quantité doit être strictement positive.")

    if str(variant.shop_id) != str(shop.id):
        raise ValueError("La variante n'appartient pas à cette boutique.")

    if variant.product.type != 'product':
        raise ValueError(
            "Les mouvements de stock ne s'appliquent qu'aux articles."
        )

    reference = reference or EntryReference()
    with transaction.atomic():
        locked = ProductVariant.objects.select_for_update().get(pk=variant.pk)
        if limit_to_available and locked.stock_quantity < qty:
            raise InsufficientStockError(locked.stock_quantity)
        movement = StockMovement.objects.create(
            shop=shop,
            variant=variant,
            movement_type=movement_type,
            quantity=qty,
            reason=reason,
            order_id=order_id,
            created_by=created_by,
            unit_purchase_price=unit_purchase_price,
            supplier_name=reference.supplier_name,
            invoice_number=reference.invoice_number,
            invoice_date=reference.invoice_date,
            ocr_result=reference.ocr_result,
            is_initial=is_initial,
        )
        variant.stock_quantity = ProductVariant.objects.values_list(
            'stock_quantity', flat=True,
        ).get(pk=variant.pk)
    return movement


# ─── Entrées, sorties et corrections ────────────────────────────────────────


def load_stock_variants(shop: Shop, ids: Sequence[uuid.UUID]) -> list[ProductVariant]:
    """Formats des lignes, dans l'ordre.

    Erreur par ligne si l'un n'est pas un format d'article de la boutique.
    """
    found = {
        v.pk: v for v in ProductVariant.objects.select_related('product').filter(
            shop=shop, product__shop=shop, product__type='product', pk__in=set(ids),
        )
    }
    errors = [{} if pk in found else {'variant': ['Format introuvable.']} for pk in ids]
    if any(errors):
        raise ValidationError({'lines': errors})
    return [found[pk] for pk in ids]


def create_entry(
    shop: Shop, user: User, lines: Sequence[EntryLine], reference: EntryReference,
) -> list[StockMovement]:
    """Entrée en plusieurs lignes, tout ou rien.

    Le prix d'achat fourni devient le dernier prix d'achat du format.
    """
    with transaction.atomic():
        movements = []
        for line in lines:
            movements.append(create_movement(
                shop, line.variant, 'in', line.quantity, created_by=user,
                reference=reference, unit_purchase_price=line.unit_purchase_price,
            ))
            if line.unit_purchase_price is not None:
                ProductVariant.objects.filter(pk=line.variant.pk).update(
                    purchase_price=line.unit_purchase_price,
                )
                line.variant.purchase_price = line.unit_purchase_price
        return movements


def create_exit(
    shop: Shop, user: User, lines: Sequence[ExitLine], reason: str, note: str = '',
) -> list[StockMovement]:
    """Sortie manuelle (perte, casse, usage interne), tout ou rien.

    Chaque ligne reste limitée au stock disponible : sinon `ValidationError`
    sur la quantité de la ligne fautive, et rien n'est enregistré.
    """
    if reason not in EXIT_TYPES:
        raise ValueError(f'Motif de sortie invalide : {reason!r}.')
    with transaction.atomic():
        movements = []
        for index, line in enumerate(lines):
            try:
                movements.append(create_movement(
                    shop, line.variant, reason, line.quantity, reason=note,
                    created_by=user, limit_to_available=True,
                ))
            except InsufficientStockError as exc:
                errors: list[dict] = [{} for _ in lines]
                errors[index] = {'quantity': [str(exc)]}
                raise ValidationError({'lines': errors}) from exc
        return movements


def adjust_to_count(
    shop: Shop, user: User, variant: ProductVariant, counted: Decimal, note: str = '',
) -> StockMovement | None:
    """Correction d'inventaire : mouvement égal à l'écart avec la quantité comptée.

    Le stock est lu sous verrou : l'écart reste juste si une vente arrive en
    même temps. Aucun mouvement si l'écart est nul.
    """
    with transaction.atomic():
        current = ProductVariant.objects.select_for_update().values_list(
            'stock_quantity', flat=True,
        ).get(pk=variant.pk)
        variant.stock_quantity = current
        delta = counted - current
        if delta == 0:
            return None
        return create_movement(
            shop, variant, 'adjustment', delta, reason=note, created_by=user,
        )


def adjust_to_counts(
    shop: Shop, user: User, lines: Sequence[CountLine], note: str = '',
) -> list[StockMovement]:
    """Correction d'inventaire en plusieurs lignes, tout ou rien.

    Un mouvement par ligne dont l'écart n'est pas nul.
    """
    with transaction.atomic():
        movements = [
            adjust_to_count(shop, user, line.variant, line.counted, note)
            for line in lines
        ]
    return [m for m in movements if m is not None]


# ─── Niveaux de stock ───────────────────────────────────────────────────────

LEVEL_SEARCH_FIELDS = ('product__name', 'packaging_name', 'sku', 'barcode')

_UNDER_THRESHOLD = Q(
    low_stock_threshold__isnull=False,
    stock_quantity__gt=0,
    stock_quantity__lte=F('low_stock_threshold'),
)

# États exclusifs d'un format : négatif (à régulariser), rupture, faible, en stock.
STOCK_STATES: dict[str, Q] = {
    'negative': Q(stock_quantity__lt=0),
    'out': Q(stock_quantity=0),
    'low': _UNDER_THRESHOLD,
    'in': Q(stock_quantity__gt=0) & (
        Q(low_stock_threshold__isnull=True)
        | Q(stock_quantity__gt=F('low_stock_threshold'))
    ),
}


def stock_levels(shop: Shop) -> QuerySet[ProductVariant]:
    """Une ligne par format suivi : formats actifs des articles actifs.

    Annotations : `state` (clé de `STOCK_STATES`), `purchase_value` (stock ×
    prix d'achat, `None` sans prix ou en négatif) et `last_movement_at`.
    """
    last_movement = StockMovement.objects.filter(
        variant=OuterRef('pk'),
    ).order_by('-created_at')
    return (
        ProductVariant.objects
        .filter(
            shop=shop, product__shop=shop, is_active=True,
            product__is_active=True, product__type='product',
        )
        .select_related('product')
        .annotate(
            state=Case(
                *[When(q, then=Value(name)) for name, q in STOCK_STATES.items()],
                output_field=CharField(),
            ),
            purchase_value=Case(
                When(
                    purchase_price__isnull=False, stock_quantity__gte=0,
                    then=F('stock_quantity') * F('purchase_price'),
                ),
                default=None,
                output_field=_MONEY,
            ),
            last_movement_at=Subquery(last_movement.values('created_at')[:1]),
        )
    )


def filter_levels(
    qs: QuerySet[ProductVariant], params: Mapping[str, str], *, skip: str | None = None,
) -> QuerySet[ProductVariant]:
    """Filtres « état » et « format » des niveaux (hors recherche) ; `skip` pour
    les facettes de l'état."""
    state = params.get('state')
    if skip != 'state' and state in STOCK_STATES:
        qs = qs.filter(STOCK_STATES[state])
    try:
        variant = uuid.UUID(params.get('variant', ''))
    except ValueError:
        return qs
    return qs.filter(pk=variant)


def build_level_facets(qs: QuerySet[ProductVariant], params: Mapping[str, str]) -> dict:
    """Nombre de formats par état, avec la recherche et les filtres de la liste."""
    by_state = filter_levels(qs, params, skip='state')
    counts = by_state.aggregate(
        all=Count('pk'),
        **{name: Count('pk', filter=q) for name, q in STOCK_STATES.items()},
    )
    return {'state': counts}


def _money(value: Decimal | None) -> str:
    return str((value or Decimal('0')).quantize(_CENT))


def build_levels_summary(shop: Shop) -> dict:
    """Indicateurs du stock : négatif, rupture, faible, valeur d'achat totale."""
    totals = stock_levels(shop).aggregate(
        formats=Count('pk'),
        negative=Count('pk', filter=STOCK_STATES['negative']),
        out_of_stock=Count('pk', filter=STOCK_STATES['out']),
        low_stock=Count('pk', filter=STOCK_STATES['low']),
        # Alias distinct de l'annotation : un agrégat du même nom la masquerait.
        total_value=Sum('purchase_value'),
    )
    total_value = totals.pop('total_value')
    return {**totals, 'purchase_value': _money(total_value)}


# ─── Mouvements ─────────────────────────────────────────────────────────────

MOVEMENT_SEARCH_FIELDS = (
    'variant__product__name', 'variant__packaging_name', 'variant__sku',
    'variant__barcode', 'reason', 'supplier_name', 'invoice_number',
)

# Filtre « type » : une sortie regroupe les sorties manuelles (et l'ancien `out`).
MOVEMENT_GROUPS: dict[str, tuple[str, ...]] = {
    'in': ('in',),
    'out': ('out', *EXIT_TYPES),
    'reservation': ('reservation',),
    'release': ('release',),
    'adjustment': ('adjustment',),
}

PERIOD_DAYS: dict[str, int] = {'today': 0, '7d': 7, '30d': 30, '90d': 90}


def movements_with_references(shop: Shop) -> QuerySet[StockMovement]:
    """Mouvements de la boutique, avec le numéro et le statut de la commande liée."""
    order = Order.objects.filter(pk=OuterRef('order_id'), shop=shop)
    return (
        StockMovement.objects.filter(shop=shop)
        .select_related('variant__product', 'created_by')
        .annotate(
            order_number=Subquery(order.values('order_number')[:1]),
            order_status=Subquery(order.values('status')[:1]),
        )
    )


def _period_start(period: str, tz_name: str) -> dt.datetime | None:
    days = PERIOD_DAYS.get(period)
    if days is None:
        return None
    today = timezone.localtime(timezone.now(), ZoneInfo(tz_name)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    return today - dt.timedelta(days=days)


def _uuid(value: str | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if value else None
    except ValueError:
        raise ValidationError({'detail': 'Identifiant invalide.'}) from None


def filter_movements(
    qs: QuerySet[StockMovement], params: Mapping[str, str], tz_name: str,
) -> QuerySet[StockMovement]:
    """Filtres de l'historique (hors recherche) : type, période, article, format."""
    group = MOVEMENT_GROUPS.get(params.get('type', ''))
    if group:
        qs = qs.filter(movement_type__in=group)
    start = _period_start(params.get('period', ''), tz_name)
    if start is not None:
        qs = qs.filter(created_at__gte=start)
    if product_id := _uuid(params.get('product')):
        qs = qs.filter(variant__product_id=product_id)
    if variant_id := _uuid(params.get('variant')):
        qs = qs.filter(variant_id=variant_id)
    return qs
