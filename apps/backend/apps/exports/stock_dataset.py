"""Export du stock (URS-059) : une ligne par format suivi, au jour de l'export.

Mêmes formats que la page Stock (`stock.services.stock_levels`) : formats actifs
des articles actifs, services exclus (ils n'ont pas de stock). Valeur estimée
d'une ligne : max(0, quantité) × prix d'achat, vide sans prix d'achat ; son total
est celui du stock de la zakat (Σ quantité positive × prix d'achat, arrondi au
centime), vérifié par les tests. Périmètre « à réapprovisionner » : négatif,
rupture et faible — un stock négatif est une rupture que l'inventaire n'a pas
encore régularisée.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, replace
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.db.models import Count, Q, QuerySet, Sum
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.products.models import ProductVariant
from apps.shops.models import Shop
from apps.stock.services import STOCK_STATES, stock_levels

from .services import (
    COUNT, MONEY, QUANTITY, TEXT, ZERO, ExportColumn, ExportDataset, ExportRow,
    ExportTotal,
)
from .texts import TEXTS

STOCK_SCOPES = ('all', 'restock')
RESTOCK_STATES = ('negative', 'out', 'low')
# Message WhatsApp : négatifs, ruptures puis stocks faibles, du plus bas au plus haut.
RESTOCK_ORDER = ('stock_quantity', 'product__name', 'packaging_name', 'id')
CENT = Decimal('0.01')

# Largeurs PDF mesurées au corps 8,25 avec des marges de 5 ; l'article prend le
# reste. Article, format et référence passent à la ligne. Prix de vente : CSV seul.
STOCK_COLUMNS = (
    ExportColumn('product', TEXT, compact=True, wrap=True),
    ExportColumn('variant', TEXT, compact=True, width=64, wrap=True),
    ExportColumn('sku', TEXT, compact=True, width=84, wrap=True),
    ExportColumn('quantity', QUANTITY, compact=True, width=52),
    ExportColumn('threshold', QUANTITY, compact=True, width=60),
    ExportColumn('status', TEXT, compact=True, width=46),
    ExportColumn('purchase_price', MONEY, compact=True, width=56),
    ExportColumn('selling_price', MONEY),
    ExportColumn('value', MONEY, compact=True, width=62),
)


@dataclass(frozen=True)
class StockFilters:
    """Périmètre et recherche de l'export, déjà validés."""

    scope: str = 'all'
    search: str = ''


def whatsapp_filters(filters: StockFilters) -> StockFilters:
    """Le message liste toujours ce qui est à réapprovisionner (recherche gardée)."""
    return replace(filters, scope='restock')


def export_stock_queryset(
    shop: Shop, filters: StockFilters,
) -> QuerySet[ProductVariant]:
    """Formats suivis de la boutique, dans le périmètre. Recherche et tri : vue."""
    qs = stock_levels(shop)
    if filters.scope == 'restock':
        restock = Q()
        for state in RESTOCK_STATES:
            restock |= STOCK_STATES[state]
        qs = qs.filter(restock)
    return qs


def cents(value: Decimal) -> Decimal:
    """Arrondi au centime le plus proche (0,005 → 0,01), comme la zakat."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _stock_totals(
    qs: QuerySet[ProductVariant], lang: str,
) -> tuple[tuple[ExportTotal, ...], str]:
    """Formats, valeur estimée, ruptures, faibles (et négatifs s'il y en a), puis
    la note des formats sans prix d'achat, hors valeur estimée."""
    sums = qs.order_by().aggregate(
        formats=Count('pk'),
        # Alias distinct de l'annotation : un agrégat du même nom la masquerait.
        total_value=Sum('purchase_value'),
        out=Count('pk', filter=STOCK_STATES['out']),
        low=Count('pk', filter=STOCK_STATES['low']),
        negative=Count('pk', filter=STOCK_STATES['negative']),
        no_price=Count('pk', filter=Q(purchase_price__isnull=True)),
    )
    totals = (
        ExportTotal('formats', COUNT, sums['formats']),
        ExportTotal('value', MONEY, cents(sums['total_value'] or ZERO)),
        ExportTotal('out', COUNT, sums['out']),
        ExportTotal('low', COUNT, sums['low']),
    )
    if sums['negative']:
        totals += (ExportTotal('negative', COUNT, sums['negative']),)
    no_price = sums['no_price']
    note = ''
    if no_price == 1:
        note = TEXTS[lang]['stock.no_price.one']
    elif no_price:
        note = TEXTS[lang]['stock.no_price.other'].format(count=no_price)
    return totals, note


def _stock_rows(qs: QuerySet[ProductVariant], lang: str) -> Iterator[ExportRow]:
    """Une ligne par format, lue par paquets ; valeur vide sans prix d'achat."""
    texts = TEXTS[lang]
    for variant in qs.iterator(chunk_size=500):
        price = variant.purchase_price
        value = None if price is None else cents(max(variant.stock_quantity, ZERO) * price)  # noqa: E501
        yield ExportRow(values={
            'product': variant.product.name,
            'variant': variant.packaging_name,
            'sku': variant.sku,
            'quantity': variant.stock_quantity,
            'threshold': variant.low_stock_threshold,
            'status': texts[f'state.{variant.state}'],
            'purchase_price': price,
            'selling_price': variant.selling_price,
            'value': value,
        })


def stock_dataset(
    shop: Shop, qs: QuerySet[ProductVariant], filters: StockFilters, lang: str,
) -> ExportDataset:
    """Jeu de données du stock `qs` (déjà cherché et trié par la vue)."""
    texts = TEXTS[lang]
    generated_at = timezone.now().astimezone(ZoneInfo(shop.timezone))
    totals, note = _stock_totals(qs, lang)
    search = (texts['filter.search'].format(query=filters.search),) if filters.search else ()  # noqa: E501
    return ExportDataset(
        shop=shop,
        lang=lang,
        kind='stock',
        title=texts[f'stock.title.{filters.scope}'],
        filename_stem=texts[f'stock.filename.{filters.scope}'],
        # Pas de période : l'état du stock au jour de l'export.
        period=texts['stock.as_of'].format(date=generated_at.strftime('%d/%m/%Y')),
        generated_at=generated_at,
        columns=STOCK_COLUMNS,
        rows=_stock_rows(qs, lang),
        row_count=qs.count(),
        totals=totals,
        totals_note=note,
        empty=texts[f'stock.empty.{filters.scope}'],
        filters=search,
    )


def log_stock_export(
    dataset: ExportDataset, *, user: User, export_format: str, filters: StockFilters,
) -> AuditLog:
    """Une ligne `stock_export` par export (famille `data.export`), ciblant la
    boutique : format, périmètre, recherche (présence seule) et nombre de lignes."""
    shop = dataset.shop
    return AuditLog.objects.create(
        shop_id=shop.id, user=user, action='stock_export',
        model_name='Shop', object_id=str(shop.id), object_repr=shop.name[:200],
        changes={
            'format': export_format,
            'rows': dataset.row_count,
            'scope': filters.scope,
            'search': bool(filters.search),
        },
    )
