from dataclasses import asdict, dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from django.db import IntegrityError, transaction
from django.db.models import (
    DecimalField,
    Exists,
    ExpressionWrapper,
    F,
    Q,
    QuerySet,
    Sum,
)
from django.utils import timezone

from apps.core.audit import log_action
from apps.orders.models import Order
from apps.products.models import ProductVariant
from apps.shops.models import Shop
from . import hawl
from .models import ZakatCalculation, ZakatProfile


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


class CalculationStateError(Exception):
    """Opération impossible dans l'état actuel de la fiche (→ 400)."""


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
    """Copie JSON des choix du profil, enregistrée avec chaque calcul."""
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


def next_hawl(profile: ZakatProfile) -> dict[str, Any] | None:
    """Prochain jour J (date grégorienne + date hégirienne), si date et calendrier sont choisis."""  # noqa: E501
    if profile.hawl_date is None or profile.calendar is None:
        return None
    try:
        day = hawl.next_hawl_date(profile.hawl_date, profile.calendar, shop_today(profile.shop))  # noqa: E501
        year, month, hijri_day = hawl.to_hijri(day)
    except hawl.HijriRangeError:
        return None
    return {'date': day, 'hijri': {'year': year, 'month': month, 'day': hijri_day}}


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
            {'variant_id': v.pk, 'product_name': v.product.name, 'packaging_name': v.packaging_name}  # noqa: E501
            for v in without_price
        ],
        'unpaid_orders': [
            {
                'id': o.pk,
                'order_number': o.order_number,
                'customer_name': o.customer.display_name if o.customer else None,
                'remaining': o.remaining,
            }
            for o in orders
        ],
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
        nisab_compared_amount=net, rate=rate, zakat_now=zakat_now,
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


def compute_zakat_amount(
    stock_for_base: Decimal,
    cash_amount: Decimal,
    receivables_amount: Decimal,
    short_term_debts: Decimal,
    zakat_rate: Decimal,
) -> tuple[Decimal, Decimal]:
    """Calcul de l'écran actuel (finalisation) : (base, montant). Base bornée à 0."""
    base = max(ZERO, stock_for_base + cash_amount + receivables_amount - short_term_debts)  # noqa: E501
    return base, _round(base * zakat_rate)


# ── Écritures ─────────────────────────────────────────────────────────────────

def _stock_is_live(calc: ZakatCalculation) -> bool:
    """Le stock suit le catalogue jusqu'au jour J inclus, puis reste figé."""
    return shop_today(calc.shop) <= calc.reference_date


def _refresh_derived(calc: ZakatCalculation, profile: ZakatProfile, *, refresh_stock: bool) -> None:  # noqa: E501
    """Recalcule ce que le serveur dérive : année du hawl, copie des choix, stock, caches."""  # noqa: E501
    calc.hawl_calendar = profile.calendar or hawl.CALENDAR_GREGORIAN
    calc.hawl_year = hawl.hawl_year(calc.reference_date, calc.hawl_calendar)
    calc.choices_snapshot = profile_choices(profile)
    if refresh_stock:
        values = compute_stock_values(calc.shop)
        calc.stock_sale_value = values.sale
        calc.stock_purchase_value = values.purchase
    # Caches lus par l'écran actuel.
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


_STATE_MESSAGES = {
    ZakatCalculation.STATUS_DRAFT: 'Un calcul finalisé n\'est plus modifiable.',
    ZakatCalculation.STATUS_FINALIZED: 'Seul un calcul finalisé peut être rouvert.',
}


def _write_refused(calc: ZakatCalculation, expected_status: str) -> Exception:
    """Pourquoi l'écriture conditionnelle n'a touché aucune ligne."""
    current = (
        ZakatCalculation.objects.filter(pk=calc.pk, shop_id=calc.shop_id, user_id=calc.user_id)  # noqa: E501
        .values_list('status', 'version')
        .first()
    )
    if current is None:
        return ZakatCalculation.DoesNotExist()
    status, version = current
    if status != expected_status:
        return CalculationStateError(_STATE_MESSAGES[expected_status])
    return VersionConflictError(version)


def _conditional_write(
    calc: ZakatCalculation,
    fields: dict[str, Any],
    *,
    expected_status: str,
    expected_version: int | None = None,
    extra_condition: Q | None = None,
) -> ZakatCalculation:
    """UPDATE … WHERE pk, boutique, personne, statut [, version] ; sans verrou.

    0 ligne → 404, 400 ou 409 selon l'état relu ; unicité violée → 409.
    """
    condition = Q(pk=calc.pk, shop_id=calc.shop_id, user_id=calc.user_id, status=expected_status)  # noqa: E501
    if expected_version is not None:
        condition &= Q(version=expected_version)
    if extra_condition is not None:
        condition &= extra_condition
    try:
        with transaction.atomic():
            updated = ZakatCalculation.objects.filter(condition).update(
                **fields, version=F('version') + 1, updated_at=timezone.now(),
            )
    except IntegrityError as exc:
        raise _duplicate_error(calc, exc) from exc
    if not updated:
        raise _write_refused(calc, expected_status)
    calc.refresh_from_db()
    return calc


def get_calculation(shop: Shop, user: Any, pk: Any) -> ZakatCalculation:
    """Fiche de la personne dans sa boutique ; `DoesNotExist` (→ 404) sinon."""
    return ZakatCalculation.objects.select_related('shop').get(pk=pk, shop=shop, user=user)  # noqa: E501


def create_calculation(shop: Shop, user: Any, data: dict[str, Any]) -> ZakatCalculation:
    """Crée la fiche de la personne pour l'année du jour J ; doublon d'année → 409."""
    profile = get_or_create_profile(shop, user)
    calc = ZakatCalculation(
        shop=shop, user=user, currency=shop.currency,
        status=ZakatCalculation.STATUS_DRAFT, **data,
    )
    if 'debts_breakdown' in data and 'debt_items' not in data:
        calc.debt_items = debt_items_from_breakdown(calc.debts_breakdown)
    _refresh_derived(calc, profile, refresh_stock=True)
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
    expected_version: int | None = None,
    refresh_stock: bool = False,
) -> ZakatCalculation:
    """Enregistre une modification. Version absente (écran actuel) : pas de contrôle."""
    if calc.status != ZakatCalculation.STATUS_DRAFT:
        raise CalculationStateError(_STATE_MESSAGES[ZakatCalculation.STATUS_DRAFT])
    if expected_version is not None and expected_version != calc.version:
        raise VersionConflictError(calc.version)
    for name, value in data.items():
        setattr(calc, name, value)
    fields = set(data) | set(DERIVED_FIELDS)
    if 'debts_breakdown' in data and 'debt_items' not in data:
        calc.debt_items = debt_items_from_breakdown(calc.debts_breakdown)
        fields.add('debt_items')
    profile = get_or_create_profile(calc.shop, calc.user)
    _refresh_derived(calc, profile, refresh_stock=refresh_stock or _stock_is_live(calc))
    return _conditional_write(
        calc, {name: getattr(calc, name) for name in fields},
        expected_status=ZakatCalculation.STATUS_DRAFT, expected_version=expected_version,  # noqa: E501
    )


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


def finalize_calculation(calc: ZakatCalculation) -> ZakatCalculation:
    """Obsolète (écran actuel, retiré en Z2) : fige base et montant, seuil des réglages boutique."""  # noqa: E501
    if calc.status == ZakatCalculation.STATUS_FINALIZED:
        raise CalculationStateError('Calcul déjà finalisé.')
    profile = get_or_create_profile(calc.shop, calc.user)
    _refresh_derived(calc, profile, refresh_stock=_stock_is_live(calc))
    base, amount = compute_zakat_amount(
        stock_for_base=calc.stock_value_for_base,
        cash_amount=calc.cash_amount,
        receivables_amount=calc.receivables_amount,
        short_term_debts=calc.short_term_debts,
        zakat_rate=calc.zakat_rate,
    )
    fields = {name: getattr(calc, name) for name in DERIVED_FIELDS}
    fields.update(
        zakat_base=base, zakat_amount=amount, currency=calc.shop.currency,
        nisab_method=calc.shop.nisab_method,
        nisab_unit_price=calc.shop.nisab_unit_price,
        nisab_threshold=compute_nisab_threshold(calc.shop),
        status=ZakatCalculation.STATUS_FINALIZED, finalized_at=timezone.now(),
    )
    return _conditional_write(calc, fields, expected_status=ZakatCalculation.STATUS_DRAFT)  # noqa: E501


def reopen_calculation(calc: ZakatCalculation) -> ZakatCalculation:
    """Obsolète (écran actuel, retiré en Z2) : repasse en brouillon s'il n'y en a pas d'autre."""  # noqa: E501
    if calc.status != ZakatCalculation.STATUS_FINALIZED:
        raise CalculationStateError(_STATE_MESSAGES[ZakatCalculation.STATUS_FINALIZED])
    other_drafts = ZakatCalculation.objects.filter(
        shop_id=calc.shop_id, user_id=calc.user_id, status=ZakatCalculation.STATUS_DRAFT,  # noqa: E501
    ).exclude(pk=calc.pk)
    if other_drafts.exists():
        raise CalculationStateError(
            'Un autre brouillon est déjà en cours. Finalisez-le ou supprimez-le d\'abord.',  # noqa: E501
        )
    return _conditional_write(
        calc, {'status': ZakatCalculation.STATUS_DRAFT, 'finalized_at': None},
        expected_status=ZakatCalculation.STATUS_FINALIZED,
        extra_condition=~Exists(other_drafts),
    )


def delete_member_zakat_data(shop: Shop, user: Any) -> None:
    """Supprime le profil et les fiches zakat d'une personne dans une boutique.

    Appelé dans la transaction du retrait du membre (`shops.services.remove_member`).
    """
    ZakatCalculation.objects.filter(shop=shop, user=user).delete()
    ZakatProfile.objects.filter(shop=shop, user=user).delete()
