import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import (
    DecimalField,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    QuerySet,
    Sum,
)
from django.utils import timezone

from apps.core.audit import log_action
from apps.orders.models import Order
from apps.products.models import ProductVariant
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.permissions import shop_has_feature
from . import hawl, reminder_texts
from .models import ZakatCalculation, ZakatProfile

logger = logging.getLogger(__name__)


# ── Erreurs (traduites en réponses HTTP par les vues) ─────────────────────────

class DuplicateHawlYearError(Exception):
    """Un calcul existe déjà pour cette personne et cette année de hawl (→ 409)."""

    def __init__(self, existing_id: Any, hawl_calendar: str, hawl_year: int):
        self.existing_id = existing_id
        self.hawl_calendar = hawl_calendar
        self.hawl_year = hawl_year
        super().__init__(f'Un calcul existe déjà pour {hawl_label(hawl_calendar, hawl_year)}.')  # noqa: E501


class VersionConflictError(Exception):
    """La fiche a été modifiée entre-temps : la version envoyée est périmée (→ 409)."""

    def __init__(self, current_version: int):
        self.current_version = current_version
        super().__init__('Le calcul a été modifié entre-temps.')


# ── Constantes ────────────────────────────────────────────────────────────────

ZERO = Decimal('0')
CENT = Decimal('0.01')
FULL_SHARE = Decimal('100')

# Quantités canoniques du seuil (conversion usuelle, référentiel D1).
NISAB_GOLD_GRAMS = Decimal('85')
NISAB_SILVER_GRAMS = Decimal('595')

# Taux selon l'année retenue (référentiel A2 et D6).
ZAKAT_RATES = {
    hawl.CALENDAR_HIJRI: Decimal('0.025'),
    hawl.CALENDAR_GREGORIAN: Decimal('0.025775'),
}

TOTALS_CHOICE_MISSING = 'choice_missing'
TOTALS_NISAB_UNKNOWN = 'nisab_unknown'
TOTALS_BELOW_NISAB = 'below_nisab'
TOTALS_ABOVE_NISAB = 'above_nisab'

# Choix sans lesquels le montant ne peut pas être calculé.
CHOICE_FIELDS = ('calendar', 'stock_valuation', 'receivables_mode', 'debts_mode')

# Plafond de lignes par saisie (créances, autres biens, dettes).
MAX_LINES = 200
TOP_STOCK_LINES = 5

# État d'une commande liée à une créance, comparée à la copie de la fiche.
ORDER_UNCHANGED = 'unchanged'
ORDER_SETTLED = 'settled'
ORDER_CANCELLED = 'cancelled'
ORDER_CHANGED = 'changed'
ORDER_REMOVED = 'removed'

# Options de chaque choix, dans l'ordre fixe du référentiel (aucune recommandée).
CHOICE_OPTIONS: dict[str, tuple[str, ...]] = {
    'calendar': (hawl.CALENDAR_HIJRI, hawl.CALENDAR_GREGORIAN),
    'nisab_method': (Shop.NISAB_METHOD_SILVER, Shop.NISAB_METHOD_GOLD),
    'stock_valuation': (
        ZakatProfile.STOCK_VALUATION_SALE, ZakatProfile.STOCK_VALUATION_PURCHASE,
    ),
    'receivables_mode': (
        ZakatProfile.RECEIVABLES_YEARLY, ZakatProfile.RECEIVABLES_ON_COLLECTION,
    ),
    'debts_mode': (
        ZakatProfile.DEBTS_ALL, ZakatProfile.DEBTS_WITHIN_12_MONTHS, ZakatProfile.DEBTS_NONE,  # noqa: E501
    ),
}


def _round(value: Decimal) -> Decimal:
    """Arrondi au centime, au plus proche (0,005 → 0,01)."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _decimal(value: Any, default: Decimal | None = ZERO) -> Decimal | None:
    """Decimal depuis une valeur JSON (str), `default` si absente ou invalide."""
    if value in (None, ''):
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


def hawl_label(hawl_calendar: str, hawl_year: int) -> str:
    """« 1448 H » ou « 2026 » : repère lisible d'une année de hawl, sans montant."""
    return f'{hawl_year} H' if hawl_calendar == hawl.CALENDAR_HIJRI else str(hawl_year)


def shop_today(shop: Shop) -> date:
    """Date du jour dans le fuseau de la boutique."""
    return timezone.localdate(timezone=ZoneInfo(shop.timezone))


# ── Profil ────────────────────────────────────────────────────────────────────

def get_or_create_profile(shop: Shop, user: Any) -> ZakatProfile:
    """Profil de la personne dans la boutique, créé vide à la première lecture.

    `get_or_create` rattrape l'IntegrityError d'une création concurrente.
    """
    profile, _ = ZakatProfile.objects.get_or_create(shop=shop, user=user)
    return profile


def update_profile(profile: ZakatProfile, data: dict[str, Any]) -> ZakatProfile:
    """Applique les champs validés ; date la saisie du prix du gramme quand il change.

    `update_fields` limité aux champs reçus : deux onglets qui modifient des champs
    différents ne s'écrasent pas.
    """
    fields = set(data)
    if 'nisab_unit_price' in data and data['nisab_unit_price'] != profile.nisab_unit_price:  # noqa: E501
        profile.nisab_price_updated_at = timezone.now() if data['nisab_unit_price'] is not None else None  # noqa: E501
        fields.add('nisab_price_updated_at')
    for name, value in data.items():
        setattr(profile, name, value)
    profile.save(update_fields=[*fields, 'updated_at'])
    return profile


def profile_choices(profile: ZakatProfile) -> dict[str, Any]:
    """Copie JSON des choix du profil : point de départ d'une nouvelle fiche."""
    price = profile.nisab_unit_price
    updated_at = profile.nisab_price_updated_at
    return {
        'calendar': profile.calendar,
        'nisab_method': profile.nisab_method,
        'nisab_unit_price': str(price) if price is not None else None,
        'nisab_price_updated_at': updated_at.isoformat() if updated_at else None,
        'stock_valuation': profile.stock_valuation,
        'receivables_mode': profile.receivables_mode,
        'debts_mode': profile.debts_mode,
        'ownership_share': str(profile.ownership_share),
    }


def merge_choices(snapshot: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """Choix de la fiche (JSON) avec les choix modifiés ; date le prix du gramme s'il change."""  # noqa: E501
    merged = {**snapshot}
    for name, value in changes.items():
        merged[name] = str(value) if isinstance(value, Decimal) else value
    if 'nisab_unit_price' in changes and merged['nisab_unit_price'] != snapshot.get('nisab_unit_price'):  # noqa: E501
        stamp = timezone.now() if changes['nisab_unit_price'] is not None else None
        merged['nisab_price_updated_at'] = stamp.isoformat() if stamp else None
    return merged


def _cycle(profile: ZakatProfile, today: date) -> tuple[date, date] | None:
    """(jour J précédent, prochain jour J) ; `None` sans date ni calendrier."""
    if profile.hawl_date is None or profile.calendar is None:
        return None
    try:
        return hawl.hawl_cycle(profile.hawl_date, profile.calendar, today)
    except hawl.HijriRangeError:
        return None


def next_hawl(profile: ZakatProfile) -> dict[str, Any] | None:
    """Prochain jour J : dates grégorienne et hégirienne, jours restants, longueur du
    cycle, année de hawl et fiche déjà ouverte pour cette année (ou `None`).

    `None` tant que la date ou le calendrier n'est pas choisi.
    """
    today = shop_today(profile.shop)
    cycle = _cycle(profile, today)
    if cycle is None:
        return None
    previous, day = cycle
    try:
        year, month, hijri_day = hawl.to_hijri(day)
    except hawl.HijriRangeError:
        return None
    hawl_year = hawl.hawl_year(day, profile.calendar)
    calculation_id = (
        ZakatCalculation.objects.filter(
            shop_id=profile.shop_id, user_id=profile.user_id,
            hawl_calendar=profile.calendar, hawl_year=hawl_year,
        )
        .values_list('pk', flat=True)
        .first()
    )
    return {
        'date': day,
        'hijri': {'year': year, 'month': month, 'day': hijri_day},
        'days_remaining': (day - today).days,
        'cycle_length': (day - previous).days,
        'hawl_calendar': profile.calendar,
        'hawl_year': hawl_year,
        'calculation_id': calculation_id,
    }


# ── Seuil ─────────────────────────────────────────────────────────────────────

def nisab_threshold_for(method: str | None, unit_price: Any) -> Decimal | None:
    """Seuil = prix du gramme × 595 g (argent) ou 85 g (or) ; `None` si non configuré."""  # noqa: E501
    price = _decimal(unit_price, default=None)
    if price is None or method not in (Shop.NISAB_METHOD_SILVER, Shop.NISAB_METHOD_GOLD):  # noqa: E501
        return None
    grams = NISAB_SILVER_GRAMS if method == Shop.NISAB_METHOD_SILVER else NISAB_GOLD_GRAMS  # noqa: E501
    return _round(price * grams)


def compute_nisab_threshold(shop: Shop) -> Decimal | None:
    """Seuil des réglages boutique — écran actuel, remplacé par le profil en Z2."""
    return nisab_threshold_for(shop.nisab_method, shop.nisab_unit_price)


# ── Stock et sources ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class StockValues:
    sale: Decimal
    purchase: Decimal


def _stock_variants(shop: Shop) -> QuerySet:
    """Formats actifs d'articles actifs, avec un stock positif."""
    return ProductVariant.objects.filter(
        shop=shop, is_active=True, product__is_active=True, stock_quantity__gt=0,
    )


def _line_value(price_field: str) -> ExpressionWrapper:
    return ExpressionWrapper(
        F(price_field) * F('stock_quantity'),
        output_field=DecimalField(max_digits=28, decimal_places=5),
    )


def compute_stock_values(shop: Shop) -> StockValues:
    """Σ quantité × prix de vente et Σ quantité × prix d'achat (formats sans prix d'achat exclus de la seconde)."""  # noqa: E501
    totals = _stock_variants(shop).aggregate(
        sale=Sum(_line_value('selling_price')),
        purchase=Sum(_line_value('purchase_price')),
    )
    return StockValues(
        sale=_round(totals['sale'] or ZERO),
        purchase=_round(totals['purchase'] or ZERO),
    )


def compute_stock_value(shop: Shop) -> Decimal:
    """Valeur d'achat du stock — écran actuel (estimation), jusqu'au lot Z2."""
    return compute_stock_values(shop).purchase


def _unpaid_orders(shop: Shop) -> QuerySet:
    """Commandes non annulées, non réglées ou partiellement réglées, avec un reste dû."""  # noqa: E501
    return (
        Order.objects.filter(shop=shop, payment_status__in=('unpaid', 'partial'))
        .exclude(status='cancelled')
        .annotate(remaining=F('total_amount') - F('amount_paid'))
        .filter(remaining__gt=0)
        .select_related('customer')
        .order_by('created_at')
    )


def _order_summary(order: Order) -> dict[str, Any]:
    """Repères d'une commande pour l'écran : numéro, client, date, reste dû."""
    return {
        'order_id': order.pk,
        'order_number': order.order_number,
        'customer_name': order.customer.display_name if order.customer else None,
        'created_at': order.created_at,
        'remaining': max(ZERO, order.remaining),
    }


def _order_receivable(order: Order) -> dict[str, Any]:
    """Créance copiée d'une commande non réglée (reste dû du jour)."""
    return {
        'order_id': str(order.pk),
        'label': order.customer.display_name if order.customer else order.order_number,
        'amount': str(order.remaining),
        'doubtful': False,
    }


def _top_stock_lines(variants: QuerySet, value_field: str) -> list[dict[str, Any]]:
    """Les formats qui pèsent le plus dans le stock, selon la valeur de vente ou d'achat."""  # noqa: E501
    rows = (
        variants.select_related('product')
        .annotate(
            sale_value=_line_value('selling_price'),
            purchase_value=_line_value('purchase_price'),
        )
        .filter(**{f'{value_field}__isnull': False})
        .order_by(F(value_field).desc(), 'product__name', 'packaging_name')[:TOP_STOCK_LINES]  # noqa: E501
    )
    return [
        {
            'variant_id': v.pk,
            'product_id': v.product_id,
            'product_name': v.product.name,
            'packaging_name': v.packaging_name,
            'quantity': v.stock_quantity,
            'sale_price': v.selling_price,
            'purchase_price': v.purchase_price,
            'sale_value': _round(v.sale_value),
            'purchase_value': _round(v.purchase_value) if v.purchase_value is not None else None,  # noqa: E501
        }
        for v in rows
    ]


def build_sources(shop: Shop) -> dict[str, Any]:
    """Ce que Mizan pré-remplit : valeurs du stock et créances clients de la boutique.

    Montants de la boutique entière : la part de la personne s'applique au calcul.
    """
    values = compute_stock_values(shop)
    variants = _stock_variants(shop)
    without_price = (
        variants.filter(purchase_price__isnull=True)
        .select_related('product')
        .order_by('product__name', 'packaging_name')
    )
    orders = list(_unpaid_orders(shop))
    return {
        'currency': shop.currency,
        'stock_sale_value': values.sale,
        'stock_purchase_value': values.purchase,
        'active_formats_count': variants.count(),
        'formats_without_purchase_price': [
            {
                'variant_id': v.pk, 'product_id': v.product_id,
                'product_name': v.product.name, 'packaging_name': v.packaging_name,
            }
            for v in without_price
        ],
        'top_stock_lines': {
            'sale': _top_stock_lines(variants, 'sale_value'),
            'purchase': _top_stock_lines(variants, 'purchase_value'),
        },
        'unpaid_orders': [_order_summary(o) for o in orders],
        'unpaid_total': sum((o.remaining for o in orders), ZERO),
    }


# ── Moteur ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class _Amounts:
    """Montants de la fiche, part de la personne appliquée (sauf autres biens)."""
    cash: Decimal
    stock_at_sale_price: Decimal
    stock_at_purchase_price: Decimal
    receivables_sure: Decimal
    receivables_doubtful: Decimal
    other_assets: Decimal
    debts_total: Decimal
    debts_within_12_months: Decimal


@dataclass(frozen=True)
class _Outcome:
    """Résultat selon les choix : `None` quand un choix nécessaire manque."""
    stock: Decimal | None
    receivables_in_base: Decimal | None
    receivables_on_collection: Decimal | None
    debts_deducted: Decimal | None
    base: Decimal | None
    nisab_threshold: Decimal | None
    nisab_compared_amount: Decimal | None
    nisab_ratio: Decimal | None
    rate: Decimal | None
    zakat_now: Decimal | None
    zakat_on_collection: Decimal | None
    zakat_total: Decimal | None
    missing_choices: tuple[str, ...]
    status: str


@dataclass(frozen=True)
class ZakatTotals:
    """Bloc `totals` (lecture seule) : tout ce que l'écran et le justificatif affichent."""  # noqa: E501
    status: str
    missing_choices: tuple[str, ...]
    ownership_share: Decimal
    cash: Decimal
    stock: Decimal | None
    stock_at_sale_price: Decimal
    stock_at_purchase_price: Decimal
    receivables_sure: Decimal
    receivables_doubtful: Decimal
    receivables_in_base: Decimal | None
    receivables_on_collection: Decimal | None
    other_assets: Decimal
    debts_total: Decimal
    debts_within_12_months: Decimal
    debts_deducted: Decimal | None
    base: Decimal | None
    nisab_threshold: Decimal | None
    nisab_compared_amount: Decimal | None
    # Plus petit / plus grand de (net, seuil) pour la jauge : rien à calculer à l'écran.
    nisab_ratio: Decimal | None
    rate: Decimal | None
    zakat_now: Decimal | None
    zakat_on_collection: Decimal | None
    zakat_total: Decimal | None
    # Montant total de zakat pour chaque option de chaque choix, les autres choix
    # restant ceux de la fiche (`None` si incalculable).
    option_effects: dict[str, dict[str, Decimal | None]]


def _sum_items(items: Iterable[dict], key: str = 'amount') -> Decimal:
    return sum((_decimal(item.get(key)) for item in items), ZERO)


def _apply_share(amount: Decimal, share: Decimal) -> Decimal:
    return _round(amount * share / FULL_SHARE)


def _amounts(calc: ZakatCalculation, share: Decimal) -> _Amounts:
    receivables = calc.receivable_items or []
    debts = calc.debt_items or []
    counted_assets = [a for a in calc.other_assets or [] if a.get('counted')]
    return _Amounts(
        cash=_apply_share(calc.cash_amount, share),
        stock_at_sale_price=_apply_share(calc.stock_sale_value + calc.stock_extra, share),  # noqa: E501
        stock_at_purchase_price=_apply_share(calc.stock_purchase_value + calc.stock_extra, share),  # noqa: E501
        receivables_sure=_apply_share(_sum_items(r for r in receivables if not r.get('doubtful')), share),  # noqa: E501
        receivables_doubtful=_apply_share(_sum_items(r for r in receivables if r.get('doubtful')), share),  # noqa: E501
        other_assets=_round(_sum_items(counted_assets)),
        debts_total=_apply_share(_sum_items(debts), share),
        debts_within_12_months=_apply_share(_sum_items(debts, 'amount_within_12_months'), share),  # noqa: E501
    )


def _status(missing: tuple[str, ...], threshold: Decimal | None, below: bool) -> str:
    if missing:
        return TOTALS_CHOICE_MISSING
    if threshold is None:
        return TOTALS_NISAB_UNKNOWN
    return TOTALS_BELOW_NISAB if below else TOTALS_ABOVE_NISAB


def _nisab_ratio(net: Decimal | None, threshold: Decimal | None) -> Decimal | None:
    if net is None or threshold is None or max(net, threshold) == ZERO:
        return None
    return (min(net, threshold) / max(net, threshold)).quantize(Decimal('0.001'))


def _evaluate(amounts: _Amounts, choices: dict[str, Any]) -> _Outcome:
    """Applique les choix d'avis aux montants : base, seuil, zakat maintenant / à l'encaissement."""  # noqa: E501
    stock = {
        ZakatProfile.STOCK_VALUATION_SALE: amounts.stock_at_sale_price,
        ZakatProfile.STOCK_VALUATION_PURCHASE: amounts.stock_at_purchase_price,
    }.get(choices.get('stock_valuation'))
    mode = choices.get('receivables_mode')
    in_base = {
        ZakatProfile.RECEIVABLES_YEARLY: amounts.receivables_sure,
        ZakatProfile.RECEIVABLES_ON_COLLECTION: ZERO,
    }.get(mode)
    debts = {
        ZakatProfile.DEBTS_ALL: amounts.debts_total,
        ZakatProfile.DEBTS_WITHIN_12_MONTHS: amounts.debts_within_12_months,
        ZakatProfile.DEBTS_NONE: ZERO,
    }.get(choices.get('debts_mode'))
    base = deferred = net = None
    if stock is not None and in_base is not None and debts is not None:
        others = amounts.cash + stock + amounts.other_assets
        net = max(ZERO, others + amounts.receivables_sure - debts)
        # « À l'encaissement » : l'excédent de dettes s'impute sur les créances sûres.
        # Même net dans les deux modes ; seul le moment du versement change.
        base = net if mode == ZakatProfile.RECEIVABLES_YEARLY else max(ZERO, others - debts)  # noqa: E501
        deferred = net - base
    threshold = nisab_threshold_for(choices.get('nisab_method'), choices.get('nisab_unit_price'))  # noqa: E501
    below = threshold is not None and net is not None and net < threshold
    rate = ZAKAT_RATES.get(choices.get('calendar'))
    zakat_now = zakat_later = total = None
    if net is not None and rate is not None:
        # Le total est arrondi une fois, sur le net : identique dans les deux modes.
        total = ZERO if below else _round(net * rate)
        zakat_now = ZERO if below else _round(base * rate)
        zakat_later = total - zakat_now
    missing = tuple(name for name in CHOICE_FIELDS if not choices.get(name))
    return _Outcome(
        stock=stock, receivables_in_base=in_base, receivables_on_collection=deferred,
        debts_deducted=debts, base=base, nisab_threshold=threshold,
        nisab_compared_amount=net, nisab_ratio=_nisab_ratio(net, threshold),
        rate=rate, zakat_now=zakat_now,
        zakat_on_collection=zakat_later, zakat_total=total,
        missing_choices=missing, status=_status(missing, threshold, below),
    )


def _option_effects(amounts: _Amounts, choices: dict[str, Any]) -> dict[str, dict[str, Decimal | None]]:  # noqa: E501
    return {
        name: {
            option: _evaluate(amounts, {**choices, name: option}).zakat_total
            for option in options
        }
        for name, options in CHOICE_OPTIONS.items()
    }


def compute_totals(calc: ZakatCalculation) -> ZakatTotals:
    """Moteur unique du calcul. Pur : lit la fiche et sa copie des choix, sans requête.

    Part de la personne appliquée à la trésorerie, au stock (catalogue + hors Mizan),
    aux créances et aux dettes de la boutique ; pas aux autres biens (personnels).
    Net = actifs + créances sûres − dettes, comparé au seuil ; sous le seuil, rien à
    verser. « À l'encaissement » ne change que le moment : maintenant sur
    (actifs − dettes), le reste du net à l'encaissement.
    """
    choices = calc.choices_snapshot or {}
    share = _decimal(choices.get('ownership_share'), default=FULL_SHARE)
    amounts = _amounts(calc, share)
    return ZakatTotals(
        ownership_share=share,
        **asdict(amounts),
        **asdict(_evaluate(amounts, choices)),
        option_effects=_option_effects(amounts, choices),
    )


# ── Ventilations de l'écran actuel (retirées en Z3) ───────────────────────────

def _sum_breakdown(breakdown: Iterable[dict], categories: set[str] | None = None) -> Decimal:  # noqa: E501
    """Somme les `amount` d'une ventilation JSON, en filtrant éventuellement par catégorie."""  # noqa: E501
    return _sum_items(
        item for item in breakdown or []
        if categories is None or item.get('category') in categories
    )


def sum_stock_breakdown(stock_breakdown: Iterable[dict]) -> Decimal:
    """Total du stock saisi ventilé par catégorie (finished / raw_materials / work_in_progress / in_transit)."""  # noqa: E501
    return _sum_breakdown(stock_breakdown)


def sum_recoverable_receivables(receivables_breakdown: Iterable[dict]) -> Decimal:
    """Total des créances zakatables : certaines + probables. Les douteuses sont archivées hors base."""  # noqa: E501
    return _sum_breakdown(receivables_breakdown, categories={'certain', 'probable'})


def sum_immediate_debts(debts_breakdown: Iterable[dict]) -> Decimal:
    """Somme des dettes marquées `is_immediately_due=True` dans la ventilation."""
    return _sum_items(item for item in debts_breakdown or [] if item.get('is_immediately_due'))  # noqa: E501


def debt_items_from_breakdown(debts_breakdown: Iterable[dict]) -> list[dict[str, Any]]:
    """Lignes de dettes depuis l'ancienne ventilation : exigible → part 12 mois = montant."""  # noqa: E501
    return [
        {
            'category': item.get('category', 'other'),
            'label': item.get('label', ''),
            'amount': str(item.get('amount', '0')),
            'amount_within_12_months': str(item.get('amount', '0')) if item.get('is_immediately_due') else '0',  # noqa: E501
        }
        for item in debts_breakdown or []
    ]


# ── Écritures ─────────────────────────────────────────────────────────────────

def _is_live(calc: ZakatCalculation) -> bool:
    """Jusqu'au jour J inclus, la fiche suit la boutique (stock, commandes) ; ensuite figée."""  # noqa: E501
    return shop_today(calc.shop) <= calc.reference_date


def _refresh_derived(calc: ZakatCalculation, *, refresh_stock: bool) -> None:
    """Recalcule ce que le serveur dérive : année du hawl (calendrier choisi dans la
    fiche, grégorien à défaut), stock, caches hérités."""
    calc.hawl_calendar = (calc.choices_snapshot or {}).get('calendar') or hawl.CALENDAR_GREGORIAN  # noqa: E501
    calc.hawl_year = hawl.hawl_year(calc.reference_date, calc.hawl_calendar)
    if refresh_stock:
        values = compute_stock_values(calc.shop)
        calc.stock_sale_value = values.sale
        calc.stock_purchase_value = values.purchase
    # Caches hérités (retirés en Z3).
    calc.stock_value_estimated = calc.stock_purchase_value
    if calc.receivables_breakdown:
        calc.receivables_amount = sum_recoverable_receivables(calc.receivables_breakdown)  # noqa: E501
    calc.short_term_debts = sum_immediate_debts(calc.debts_breakdown)


DERIVED_FIELDS = (
    'hawl_calendar', 'hawl_year', 'choices_snapshot',
    'stock_sale_value', 'stock_purchase_value',
    'stock_value_estimated', 'receivables_amount', 'short_term_debts',
)


def _duplicate_error(calc: ZakatCalculation, exc: IntegrityError) -> DuplicateHawlYearError:  # noqa: E501
    """Traduit la violation d'unicité (personne, année) en erreur métier ; sinon relance."""  # noqa: E501
    existing = (
        ZakatCalculation.objects.filter(
            shop_id=calc.shop_id, user_id=calc.user_id,
            hawl_calendar=calc.hawl_calendar, hawl_year=calc.hawl_year,
        )
        .exclude(pk=calc.pk)
        .values_list('pk', flat=True)
        .first()
    )
    if existing is None:
        raise exc
    return DuplicateHawlYearError(existing, calc.hawl_calendar, calc.hawl_year)


def _write_refused(calc: ZakatCalculation) -> Exception:
    """Pourquoi l'écriture conditionnelle n'a touché aucune ligne : fiche supprimée ou
    version périmée."""
    version = (
        ZakatCalculation.objects.filter(pk=calc.pk, shop_id=calc.shop_id, user_id=calc.user_id)  # noqa: E501
        .values_list('version', flat=True)
        .first()
    )
    if version is None:
        return ZakatCalculation.DoesNotExist()
    return VersionConflictError(version)


def _conditional_write(
    calc: ZakatCalculation, fields: dict[str, Any], *, expected_version: int,
) -> ZakatCalculation:
    """UPDATE … WHERE pk, boutique, personne, version ; sans verrou.

    0 ligne → 404 ou 409 selon l'état relu ; unicité violée → 409.
    """
    condition = Q(pk=calc.pk, shop_id=calc.shop_id, user_id=calc.user_id, version=expected_version)  # noqa: E501
    try:
        with transaction.atomic():
            updated = ZakatCalculation.objects.filter(condition).update(
                **fields, version=F('version') + 1, updated_at=timezone.now(),
            )
    except IntegrityError as exc:
        raise _duplicate_error(calc, exc) from exc
    if not updated:
        raise _write_refused(calc)
    calc.refresh_from_db()
    return calc


def _newer_calculations(calc: ZakatCalculation) -> QuerySet:
    """Fiches de la même personne dont le jour J est postérieur."""
    return ZakatCalculation.objects.filter(
        shop_id=calc.shop_id, user_id=calc.user_id, reference_date__gt=calc.reference_date,  # noqa: E501
    )


def _sync_latest_profile(calc: ZakatCalculation, changes: dict[str, Any]) -> None:
    """Le profil (point de départ des prochaines fiches) reprend les choix modifiés de
    la fiche la plus récente ; jamais le jour J.

    Condition portée par l'UPDATE (aucune fiche plus récente), pas par une lecture
    préalable : à appeler dans la transaction qui écrit la fiche.
    """
    fields = dict(changes)
    if 'nisab_unit_price' in changes:
        stamp = calc.choices_snapshot.get('nisab_price_updated_at')
        fields['nisab_price_updated_at'] = datetime.fromisoformat(stamp) if stamp else None  # noqa: E501
    (
        ZakatProfile.objects.filter(shop_id=calc.shop_id, user_id=calc.user_id)
        .filter(~Exists(_newer_calculations(calc)))
        .update(**fields, updated_at=timezone.now())
    )


def get_calculation(shop: Shop, user: Any, pk: Any) -> ZakatCalculation:
    """Fiche de la personne dans sa boutique ; `DoesNotExist` (→ 404) sinon."""
    return ZakatCalculation.objects.select_related('shop').get(pk=pk, shop=shop, user=user)  # noqa: E501


def create_calculation(shop: Shop, user: Any, data: dict[str, Any]) -> ZakatCalculation:
    """Crée la fiche de la personne ; doublon d'année → 409.

    Jour J : celui reçu, sinon le prochain du profil, sinon aujourd'hui. Choix copiés
    du profil. Sans créances reçues, les commandes non réglées sont recopiées.
    """
    profile = get_or_create_profile(shop, user)
    data = dict(data)
    changes = data.pop('choices_snapshot', None) or {}
    if data.get('reference_date') is None:
        cycle = _cycle(profile, shop_today(shop))
        data['reference_date'] = cycle[1] if cycle else shop_today(shop)
    calc = ZakatCalculation(
        shop=shop, user=user, currency=shop.currency,
        status=ZakatCalculation.STATUS_DRAFT, **data,
    )
    calc.choices_snapshot = merge_choices(profile_choices(profile), changes)
    if 'receivable_items' not in data:
        calc.receivable_items = [_order_receivable(o) for o in _unpaid_orders(shop)[:MAX_LINES]]  # noqa: E501
    if 'debts_breakdown' in data and 'debt_items' not in data:
        calc.debt_items = debt_items_from_breakdown(calc.debts_breakdown)
    _refresh_derived(calc, refresh_stock=True)
    try:
        with transaction.atomic():
            calc.save(force_insert=True)
            log_action(
                shop_id=shop.pk, user=user, action='zakat_created',
                model_name='ZakatCalculation', obj_id=calc.pk,
                obj_repr=f'Zakat {hawl_label(calc.hawl_calendar, calc.hawl_year)}',
            )
    except IntegrityError as exc:
        raise _duplicate_error(calc, exc) from exc
    return calc


def update_calculation(
    calc: ZakatCalculation,
    data: dict[str, Any],
    *,
    expected_version: int,
    refresh_stock: bool = False,
) -> ZakatCalculation:
    """Enregistre une modification ; version périmée → 409.

    Les choix appartiennent à la fiche : un changement de calendrier recalcule l'année
    (409 si elle est prise, rien n'est écrit). Si la fiche est la plus récente de la
    personne, son profil reprend les choix modifiés dans la même transaction.
    """
    if expected_version != calc.version:
        raise VersionConflictError(calc.version)
    data = dict(data)
    changes = data.pop('choices_snapshot', None) or {}
    for name, value in data.items():
        setattr(calc, name, value)
    fields = set(data) | set(DERIVED_FIELDS)
    if 'debts_breakdown' in data and 'debt_items' not in data:
        calc.debt_items = debt_items_from_breakdown(calc.debts_breakdown)
        fields.add('debt_items')
    calc.choices_snapshot = merge_choices(calc.choices_snapshot or {}, changes)
    _refresh_derived(calc, refresh_stock=refresh_stock or _is_live(calc))
    with transaction.atomic():
        calc = _conditional_write(
            calc, {name: getattr(calc, name) for name in fields},
            expected_version=expected_version,
        )
        if changes:
            _sync_latest_profile(calc, changes)
    return calc


def delete_calculation(calc: ZakatCalculation, user: Any) -> None:
    with transaction.atomic():
        log_action(
            shop_id=calc.shop_id, user=user, action='zakat_deleted',
            model_name='ZakatCalculation', obj_id=calc.pk,
            obj_repr=f'Zakat {hawl_label(calc.hawl_calendar, calc.hawl_year)}',
        )
        calc.delete()


def record_pdf_download(calc: ZakatCalculation, user: Any) -> None:
    log_action(
        shop_id=calc.shop_id, user=user, action='zakat_pdf_download',
        model_name='ZakatCalculation', obj_id=calc.pk,
        obj_repr=f'Zakat {hawl_label(calc.hawl_calendar, calc.hawl_year)}',
    )


# ── Repères de l'écran ────────────────────────────────────────────────────────

def _order_state(order: Order | None, amount: Decimal) -> str:
    if order is None:
        return ORDER_REMOVED
    if order.status == 'cancelled':
        return ORDER_CANCELLED
    if order.remaining <= ZERO:
        return ORDER_SETTLED
    return ORDER_CHANGED if order.remaining != amount else ORDER_UNCHANGED


def _linked_order(item: dict[str, Any], order: Order | None, live: bool) -> dict[str, Any]:  # noqa: E501
    state = _order_state(order, _decimal(item.get('amount'))) if live else ORDER_UNCHANGED  # noqa: E501
    if order is None:
        summary = {
            'order_id': item['order_id'], 'order_number': None, 'customer_name': None,
            'created_at': None, 'remaining': None,
        }
    else:
        summary = _order_summary(order)
    return {**summary, 'state': state}


def receivable_review(calc: ZakatCalculation) -> dict[str, list[dict[str, Any]]]:
    """Créances liées à une commande, comparées à la commande aujourd'hui (réglée,
    annulée, supprimée, reste dû changé), et commandes non réglées absentes de la fiche.

    Jour J passé : la fiche est figée, rien n'est signalé ni proposé.
    """
    lines = [item for item in calc.receivable_items or [] if item.get('order_id')]
    ids = [item['order_id'] for item in lines]
    orders = {
        str(o.pk): o
        for o in Order.objects.filter(shop_id=calc.shop_id, pk__in=ids)
        .annotate(remaining=F('total_amount') - F('amount_paid'))
        .select_related('customer')
    }
    live = _is_live(calc)
    new = _unpaid_orders(calc.shop).exclude(pk__in=ids)[:MAX_LINES] if live else []
    return {
        'linked': [_linked_order(item, orders.get(item['order_id']), live) for item in lines],  # noqa: E501
        'new': [_order_summary(o) for o in new],
    }


def _differs_from_profile_hawl(calc: ZakatCalculation) -> bool:
    """Le jour J de la fiche ne tombe pas sur le jour J du profil (ou il n'y en a pas)."""  # noqa: E501
    hawl_date = (
        ZakatProfile.objects.filter(shop_id=calc.shop_id, user_id=calc.user_id)
        .values_list('hawl_date', flat=True)
        .first()
    )
    if hawl_date is None:
        return True
    try:
        anniversary = hawl.next_hawl_date(hawl_date, calc.hawl_calendar, calc.reference_date)  # noqa: E501
    except hawl.HijriRangeError:
        return False
    return anniversary != calc.reference_date


def calculation_review(calc: ZakatCalculation) -> dict[str, Any]:
    """Repères de l'écran de la fiche : la plus récente de la personne ? encore vivante
    (jour J pas passé) ? jour J du profil différent (proposé seulement sur la plus
    récente) ? état des commandes liées."""
    is_latest = not _newer_calculations(calc).exists()
    return {
        'is_latest': is_latest,
        'is_live': _is_live(calc),
        'hawl_date_differs': is_latest and _differs_from_profile_hawl(calc),
        'receivable_orders': receivable_review(calc),
    }


def delete_member_zakat_data(shop: Shop, user: Any) -> None:
    """Supprime le profil et les fiches zakat d'une personne dans une boutique.

    Appelé dans la transaction du retrait du membre (`shops.services.remove_member`).
    """
    ZakatCalculation.objects.filter(shop=shop, user=user).delete()
    ZakatProfile.objects.filter(shop=shop, user=user).delete()


# ── Rappel du jour J ──────────────────────────────────────────────────────────

REMINDER_DAYS_BEFORE = 7


def hawl_reminder_profiles() -> QuerySet:
    """Profils à prévenir : réglage activé, jour J et calendrier choisis, personne
    active et encore admin (propriétaire ou admin) de la boutique."""
    admin = ShopMember.objects.filter(
        shop_id=OuterRef('shop_id'), user_id=OuterRef('user_id'),
        role__in=(ShopMember.ROLE_OWNER, ShopMember.ROLE_ADMIN),
    )
    return (
        ZakatProfile.objects.filter(
            Exists(admin), reminder_email_enabled=True, hawl_date__isnull=False,
            calendar__isnull=False, user__is_active=True,
        )
        .select_related('shop', 'user')
        .order_by('pk')
    )


def _reminder_day(profile: ZakatProfile, today: date) -> date | None:
    """Prochain jour J s'il tombe dans 1 à 7 jours (J-7 à J-1), sinon `None`."""
    cycle = _cycle(profile, today)
    if cycle is None:
        return None
    day = cycle[1]
    return day if 1 <= (day - today).days <= REMINDER_DAYS_BEFORE else None


def send_hawl_reminder(profile: ZakatProfile, today: date) -> bool:
    """E-mail à la personne, de J-7 à J-1, une seule fois par année de hawl.

    La réservation (update conditionnel, jamais une lecture préalable) et l'envoi
    partagent la transaction : un envoi en échec annule la réservation et le rappel
    repart à l'exécution suivante. Une tâche simultanée attend le verrou de la ligne,
    puis ne trouve plus rien à réserver.
    """
    day = _reminder_day(profile, today)
    if day is None:
        return False
    calendar = profile.calendar
    year = hawl.hawl_year(day, calendar)
    with transaction.atomic():
        claimed = (
            ZakatProfile.objects.filter(pk=profile.pk, reminder_email_enabled=True)
            .exclude(reminder_sent_calendar=calendar, reminder_sent_year=year)
            .update(reminder_sent_calendar=calendar, reminder_sent_year=year)
        )
        if not claimed:
            return False
        subject, body = reminder_texts.build_email(profile.user, day)
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [profile.user.email])
    return True


def send_hawl_reminders(now: datetime | None = None) -> int:
    """Tâche quotidienne : rappel de chaque profil, au jour du fuseau de sa boutique.

    Seulement les boutiques dont la formule comprend la zakat. Un profil en erreur
    n'empêche pas les autres.
    """
    now = now or timezone.now()
    sent = 0
    for profile in hawl_reminder_profiles().iterator():
        if not shop_has_feature(profile.shop, 'zakat'):
            continue
        today = now.astimezone(ZoneInfo(profile.shop.timezone)).date()
        try:
            sent += send_hawl_reminder(profile, today)
        except Exception:
            logger.exception('Rappel zakat en échec pour le profil %s', profile.pk)
    return sent
