from decimal import Decimal, InvalidOperation
from typing import Iterable

from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from django.utils import timezone

from apps.shops.models import Shop
from apps.products.models import ProductVariant
from .models import ZakatCalculation


class YearAlreadyFinalizedError(Exception):
    """Levée si on tente de finaliser un calcul alors qu'un autre est déjà figé pour la même année.

    La zakat est due une fois par hawl (cycle annuel) — autoriser plusieurs calculs
    finalisés pour la même année créerait de l'ambiguïté sur le justificatif faisant foi.
    """

    def __init__(self, year: int, existing_id):
        self.year = year
        self.existing_id = existing_id
        super().__init__(f'Un calcul finalisé existe déjà pour {year}.')


# ── Nisab ─────────────────────────────────────────────────────────────────────
# Quantités canoniques pour les deux méthodes de calcul du seuil.
NISAB_GOLD_GRAMS = Decimal('85')
NISAB_SILVER_GRAMS = Decimal('595')


def compute_nisab_threshold(shop: Shop) -> Decimal | None:
    """Seuil de Nisab en devise boutique, ou `None` si le prix unitaire n'est pas configuré.

    Le cours change quotidiennement → c'est à l'utilisateur de saisir la valeur courante
    dans les paramètres de la boutique. Pas de fallback automatique.
    """
    if shop.nisab_unit_price is None:
        return None
    grams = NISAB_SILVER_GRAMS if shop.nisab_method == Shop.NISAB_METHOD_SILVER else NISAB_GOLD_GRAMS
    return (shop.nisab_unit_price * grams).quantize(Decimal('0.01'))


# ── Stock ─────────────────────────────────────────────────────────────────────

def compute_stock_value(shop: Shop) -> Decimal:
    """Somme de (purchase_price × stock_quantity) sur toutes les variantes actives avec stock positif.

    Sémantique : `purchase_price` est € PAR FORMAT et `stock_quantity` est le NOMBRE
    de formats — le produit donne donc directement la valeur d'achat totale en €.
    """
    result = (
        ProductVariant.objects.filter(
            shop=shop,
            is_active=True,
            product__is_active=True,
            stock_quantity__gt=0,
            purchase_price__isnull=False,
        )
        .annotate(
            line_value=ExpressionWrapper(
                F('purchase_price') * F('stock_quantity'),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )
        .aggregate(total=Sum('line_value'))['total']
    )
    return result or Decimal('0')


# ── Sommes sur ventilations JSON ──────────────────────────────────────────────

def _sum_breakdown(breakdown: Iterable[dict], categories: set[str] | None = None) -> Decimal:
    """Somme les `amount` d'une ventilation JSON, en filtrant éventuellement par catégorie.

    Items mal formés (montant invalide, catégorie absente du filtre) → ignorés.
    """
    total = Decimal('0')
    for item in breakdown or []:
        if categories is not None and item.get('category') not in categories:
            continue
        try:
            total += Decimal(str(item.get('amount', '0')))
        except (InvalidOperation, TypeError):
            continue
    return total


def sum_stock_breakdown(stock_breakdown: Iterable[dict]) -> Decimal:
    """Total du stock saisi ventilé par catégorie (finished / raw_materials / work_in_progress / in_transit)."""
    return _sum_breakdown(stock_breakdown)


def sum_recoverable_receivables(receivables_breakdown: Iterable[dict]) -> Decimal:
    """Total des créances zakatables : certaines + probables. Les douteuses sont archivées hors base."""
    return _sum_breakdown(receivables_breakdown, categories={'certain', 'probable'})


# ── Dettes ────────────────────────────────────────────────────────────────────

def sum_immediate_debts(debts_breakdown: Iterable[dict]) -> Decimal:
    """Somme des dettes marquées `is_immediately_due=True` dans la ventilation.

    Tolérante aux items mal formés (montant invalide ou flag absent → ignoré silencieusement)
    car le payload vient du client et est validé côté serializer.
    """
    total = Decimal('0')
    for item in debts_breakdown or []:
        if not item.get('is_immediately_due'):
            continue
        try:
            total += Decimal(str(item.get('amount', '0')))
        except (InvalidOperation, TypeError):
            continue
    return total


# ── Calcul ────────────────────────────────────────────────────────────────────

def compute_zakat_amount(
    stock_for_base: Decimal,
    cash_amount: Decimal,
    receivables_amount: Decimal,
    short_term_debts: Decimal,
    zakat_rate: Decimal,
) -> tuple[Decimal, Decimal]:
    """Pure : retourne (base_zakatable, montant_zakat). Base bornée à 0."""
    base = stock_for_base + cash_amount + receivables_amount - short_term_debts
    if base < Decimal('0'):
        base = Decimal('0')
    amount = (base * zakat_rate).quantize(Decimal('0.01'))
    return base, amount


def recompute_draft_totals(calc: ZakatCalculation) -> ZakatCalculation:
    """Recalcule les agrégats dérivés sur un brouillon, sans figer la base ni le montant.
    Appelé à chaque sauvegarde de l'assistant.

    Règles de priorité :
      - `receivables_amount` = somme certaines+probables si `receivables_breakdown` non vide,
        sinon valeur fournie par le client (rétro-compat).
      - `stock_value_estimated` est toujours recalculé depuis le catalogue (référence).
      - `short_term_debts` = somme des dettes `is_immediately_due=True`.
    """
    calc.stock_value_estimated = compute_stock_value(calc.shop)
    if calc.receivables_breakdown:
        calc.receivables_amount = sum_recoverable_receivables(calc.receivables_breakdown)
    calc.short_term_debts = sum_immediate_debts(calc.debts_breakdown)
    return calc


def finalize_calculation(calc: ZakatCalculation) -> ZakatCalculation:
    """Fige le calcul : recalcule estimations, applique le taux, snapshot Nisab, marque comme `finalized`.

    Refuse si un autre calcul finalisé existe déjà pour la même boutique et la même
    année de référence (un hawl = un calcul faisant foi).
    """
    # `reference_date` peut être une `date` (cas normal) ou un str si l'instance n'a pas été
    # rechargée depuis la DB (cas des tests qui passent la valeur en string brute).
    ref = calc.reference_date
    if isinstance(ref, str):
        from datetime import date as _date
        ref = _date.fromisoformat(ref)
    year = ref.year
    existing = (
        ZakatCalculation.objects.filter(
            shop=calc.shop,
            status=ZakatCalculation.STATUS_FINALIZED,
            reference_date__year=year,
        )
        .exclude(pk=calc.pk)
        .values_list('pk', flat=True)
        .first()
    )
    if existing is not None:
        raise YearAlreadyFinalizedError(year=year, existing_id=existing)

    recompute_draft_totals(calc)
    base, amount = compute_zakat_amount(
        stock_for_base=calc.stock_value_for_base,
        cash_amount=calc.cash_amount,
        receivables_amount=calc.receivables_amount,
        short_term_debts=calc.short_term_debts,
        zakat_rate=calc.zakat_rate,
    )
    calc.zakat_base = base
    calc.zakat_amount = amount
    # Snapshot Nisab : on capture les paramètres au moment du gel pour figer le verdict.
    calc.nisab_method = calc.shop.nisab_method
    calc.nisab_unit_price = calc.shop.nisab_unit_price
    calc.nisab_threshold = compute_nisab_threshold(calc.shop)
    calc.status = ZakatCalculation.STATUS_FINALIZED
    calc.finalized_at = timezone.now()
    calc.currency = calc.shop.currency
    calc.save()
    return calc


# ── Helper rétro-compatible (utilisé par les tests existants) ─────────────────

def calculate_zakat(
    shop: Shop,
    reference_date,
    cash_amount: Decimal = Decimal('0'),
    receivables_amount: Decimal = Decimal('0'),
    short_term_debts: Decimal = Decimal('0'),
    stock_value_adjusted: Decimal | None = None,
    notes: str = '',
    zakat_rate: Decimal = Decimal('0.0250'),
) -> ZakatCalculation:
    """Crée et finalise un calcul en un appel — chemin direct sans assistant (tests, API legacy)."""
    stock_estimated = compute_stock_value(shop)
    stock_for_base = stock_value_adjusted if stock_value_adjusted is not None else stock_estimated
    base, amount = compute_zakat_amount(
        stock_for_base=stock_for_base,
        cash_amount=cash_amount,
        receivables_amount=receivables_amount,
        short_term_debts=short_term_debts,
        zakat_rate=zakat_rate,
    )
    return ZakatCalculation.objects.create(
        shop=shop,
        reference_date=reference_date,
        status=ZakatCalculation.STATUS_FINALIZED,
        current_step=5,
        cash_amount=cash_amount,
        receivables_amount=receivables_amount,
        receivables_nominal=receivables_amount,
        has_receivables=receivables_amount > 0,
        stock_value_estimated=stock_estimated,
        stock_value_adjusted=stock_value_adjusted,
        short_term_debts=short_term_debts,
        zakat_base=base,
        zakat_rate=zakat_rate,
        zakat_amount=amount,
        currency=shop.currency,
        notes=notes,
        finalized_at=timezone.now(),
    )
