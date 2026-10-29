"""Suivi à l'encaissement des créances différées (lot Z4, référentiel D3 et D4).

Calculé à la lecture, sans tâche planifiée ni écriture. Pour chaque fiche dont le
jour J est passé :

- encaissé depuis la fiche = montant de la ligne − reste dû actuel de la commande
  (borné entre 0 et le montant ; commande annulée ou supprimée : rien), ou, pour une
  créance saisie à la main, le montant déclaré avec « Encaissée » ;
- créance sûre d'une fiche « à l'encaissement » : sa part de la zakat à
  l'encaissement, due au prorata de l'encaissé (rien si la fiche est sous le seuil) ;
  une créance reprise sur plusieurs fiches donne un élément par fiche (D3) ;
- créance douteuse : regroupée par commande sur les fiches où elle est douteuse ;
  la personne choisit l'option D4, sans option par défaut.

Seules les actions de la personne s'écrivent (`ZakatReceivableFollowUp`), toujours
sur la ligne de la fiche d'origine, par écriture conditionnelle. Le journal d'audit
ne porte aucun montant.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.core.audit import log_action
from apps.orders.models import Order
from apps.shops.models import Shop
from .models import ZakatCalculation, ZakatProfile, ZakatReceivableFollowUp
from .services import (
    FULL_SHARE,
    ORDER_CANCELLED,
    ORDER_REMOVED,
    TOTALS_ABOVE_NISAB,
    TOTALS_BELOW_NISAB,
    ZERO,
    ZakatTotals,
    _decimal,
    _round,
    compute_totals,
    hawl_label,
    is_personal,
    shop_today,
)

KIND_SURE = 'sure'
KIND_DOUBTFUL = 'doubtful'

ORDER_OPEN = 'open'

STATE_CANCELLED = 'cancelled'
STATE_IGNORED = 'ignored'
STATE_PENDING = 'pending'
STATE_CHOICE_NEEDED = 'choice_needed'
STATE_TO_PAY = 'to_pay'
STATE_PAID = 'paid'
STATE_NOTHING_DUE = 'nothing_due'
# États qui appellent une action : la carte de l'accueil ne montre que ceux-là.
ACTIONABLE_STATES = (STATE_CHOICE_NEEDED, STATE_TO_PAY)

YEAR_BELOW_NISAB = 'below_nisab'
YEAR_INCOMPLETE = 'incomplete'

ACTION_OPTION = 'option'
ACTION_COLLECTED = 'collected'
ACTION_PAID = 'paid'
ACTION_IGNORE = 'ignore'
ACTION_REVERT = 'revert'

REVERT_PAID = 'paid'
REVERT_IGNORE = 'ignore'
REVERT_COLLECTED = 'collected'
REVERTIBLE = (REVERT_PAID, REVERT_IGNORE, REVERT_COLLECTED)


# ── Erreurs (traduites en réponses HTTP par les vues) ─────────────────────────

class FollowUpNotFound(Exception):
    """Aucune créance suivie pour cette fiche et cette ligne (→ 404)."""


class FollowUpActionError(Exception):
    """Action impossible sur cette créance (→ 400)."""


class FollowUpConflictError(Exception):
    """La créance a changé entre-temps : montant périmé ou action déjà faite (→ 409)."""

    def __init__(self, item: 'FollowUpItem'):
        self.item = item
        super().__init__('Cette créance a changé entre-temps.')


# ── Lecture ───────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FollowUpYear:
    """Une fiche où figure une créance douteuse : zakat de l'encaissé pour cette
    année, ou `None` avec la raison quand la fiche n'est pas comptée."""
    calculation_id: Any
    hawl_calendar: str
    hawl_year: int
    amount: Decimal | None
    excluded: str | None


@dataclass(frozen=True)
class FollowUpItem:
    """Une créance suivie. `calculation_id` / `line_id` : la ligne de la fiche
    d'origine, où s'écrivent les actions ; `lines` : toutes les lignes regroupées."""
    calculation_id: Any
    line_id: str
    hawl_calendar: str
    hawl_year: int
    kind: str
    order_id: str | None
    order_number: str | None
    customer_name: str | None
    label: str
    scope: str
    currency: str
    amount: Decimal
    collected: Decimal
    collected_on: date | None
    order_state: str | None
    below_nisab: bool
    part: Decimal | None
    years: list[FollowUpYear]
    options: dict[str, Decimal] | None
    option: str | None
    due: Decimal
    paid: Decimal
    remaining: Decimal
    state: str
    can_revert_paid: bool
    lines: list[tuple[str, str]] = field(repr=False)
    # Versé sur la ligne d'origine au moment de la lecture : condition de l'écriture.
    target_paid: Decimal = field(repr=False, default=ZERO)


@dataclass(frozen=True)
class _Line:
    """Une ligne de créance d'une fiche passée, avec ce qu'il faut pour la suivre."""
    calc: ZakatCalculation
    totals: ZakatTotals
    item: dict[str, Any]
    order: Order | None
    row: ZakatReceivableFollowUp | None

    @property
    def key(self) -> tuple[str, str]:
        return str(self.calc.pk), str(self.item['id'])

    @property
    def amount(self) -> Decimal:
        return _decimal(self.item.get('amount'))

    def counted(self, value: Decimal) -> Decimal:
        """Montant compté pour la personne (part appliquée aux lignes boutique)."""
        if is_personal(self.item):
            return value
        return value * self.totals.ownership_share / FULL_SHARE

    def collected(self) -> tuple[Decimal, str | None]:
        """(encaissé depuis la fiche, état de la commande ; `None` sans commande)."""
        if self.item.get('order_id'):
            if self.order is None:
                return ZERO, ORDER_REMOVED
            if self.order.status == 'cancelled':
                return ZERO, ORDER_CANCELLED
            return min(self.amount, max(ZERO, self.amount - self.order.remaining)), ORDER_OPEN  # noqa: E501
        if self.row is not None and self.row.collected_amount is not None:
            return min(self.amount, self.row.collected_amount), None
        return ZERO, None


def _past_calculations(shop: Shop, user: Any) -> list[ZakatCalculation]:
    """Fiches de la personne dont le jour J est passé, de la plus ancienne à la plus
    récente. Avant le jour J, la fiche suit encore les commandes : rien à suivre."""
    return list(
        ZakatCalculation.objects.filter(shop=shop, user=user, reference_date__lt=shop_today(shop))  # noqa: E501
        .select_related('shop')
        .order_by('reference_date', 'created_at')
    )


def _orders(shop: Shop, calcs: list[ZakatCalculation]) -> dict[str, Order]:
    ids = {
        item['order_id']
        for calc in calcs
        for item in calc.receivable_items or []
        if item.get('order_id')
    }
    return {
        str(order.pk): order
        for order in Order.objects.filter(shop=shop, pk__in=ids)
        .annotate(remaining=F('total_amount') - F('amount_paid'))
        .select_related('customer')
    }


def _lines(shop: Shop, user: Any) -> list[_Line]:
    calcs = _past_calculations(shop, user)
    orders = _orders(shop, calcs)
    rows = {
        (str(row.calculation_id), str(row.line_id)): row
        for row in ZakatReceivableFollowUp.objects.filter(shop=shop, user=user, calculation__in=calcs)  # noqa: E501
    }
    lines = []
    for calc in calcs:
        totals = compute_totals(calc)
        for item in calc.receivable_items or []:
            if not item.get('id'):
                continue
            order = orders.get(item['order_id']) if item.get('order_id') else None
            lines.append(_Line(calc, totals, item, order, rows.get((str(calc.pk), str(item['id'])))))  # noqa: E501
    return lines


def _is_on_collection(line: _Line) -> bool:
    mode = (line.calc.choices_snapshot or {}).get('receivables_mode')
    return mode == ZakatProfile.RECEIVABLES_ON_COLLECTION and line.totals.status in (
        TOTALS_ABOVE_NISAB, TOTALS_BELOW_NISAB,
    )


def _sure_parts(lines: list[_Line]) -> dict[tuple[str, str], Decimal]:
    """Part de chaque créance sûre dans la zakat à l'encaissement de sa fiche, au
    prorata du montant compté. Arrondi cumulé : la somme des parts d'une fiche
    retombe exactement sur sa zakat à l'encaissement."""
    parts: dict[tuple[str, str], Decimal] = {}
    by_calc: dict[str, list[_Line]] = {}
    for line in lines:
        by_calc.setdefault(str(line.calc.pk), []).append(line)
    for group in by_calc.values():
        zakat = group[0].totals.zakat_on_collection or ZERO
        total = sum((line.counted(line.amount) for line in group), ZERO)
        cumulated = allocated = ZERO
        for line in group:
            cumulated += line.counted(line.amount)
            target = _round(zakat * cumulated / total) if total > 0 else ZERO
            parts[line.key] = target - allocated
            allocated = target
    return parts


def _order_fields(line: _Line) -> dict[str, Any]:
    order = line.order
    return {
        'order_id': line.item.get('order_id'),
        'order_number': order.order_number if order else None,
        'customer_name': order.customer.display_name if order and order.customer else None,  # noqa: E501
    }


def _row_fields(row: ZakatReceivableFollowUp | None) -> dict[str, Any]:
    """Ce que la ligne d'origine porte : versé, choix, ignorée, encaissement saisi."""
    if row is None:
        return {'paid': ZERO, 'option': None, 'ignored': False, 'revert': False, 'on': None}  # noqa: E501
    return {
        'paid': row.paid_amount, 'option': row.doubtful_option,
        'ignored': row.ignored_at is not None, 'revert': row.last_paid_amount > 0,
        'on': row.collected_on,
    }


def _state(*, order_state: str | None, ignored: bool, collected: Decimal, nothing: bool,
           choice_needed: bool, remaining: Decimal, paid: Decimal) -> str:
    if order_state in (ORDER_CANCELLED, ORDER_REMOVED):
        return STATE_CANCELLED
    if ignored:
        return STATE_IGNORED
    if collected <= 0:
        return STATE_PENDING
    if nothing:
        return STATE_NOTHING_DUE
    if choice_needed:
        return STATE_CHOICE_NEEDED
    if remaining > 0:
        return STATE_TO_PAY
    return STATE_PAID if paid > 0 else STATE_NOTHING_DUE


def _item(origin: _Line, group: list[_Line], **amounts: Any) -> FollowUpItem:
    collected, order_state = origin.collected()
    row = _row_fields(origin.row)
    due = amounts['due']
    remaining = max(ZERO, due - row['paid'])
    return FollowUpItem(
        calculation_id=origin.calc.pk, line_id=str(origin.item['id']),
        hawl_calendar=origin.calc.hawl_calendar, hawl_year=origin.calc.hawl_year,
        kind=amounts['kind'], **_order_fields(origin),
        label=origin.item.get('label', ''), scope=origin.item.get('scope') or 'shop',
        currency=origin.calc.currency, amount=origin.amount,
        collected=collected, collected_on=row['on'], order_state=order_state,
        below_nisab=origin.totals.status == TOTALS_BELOW_NISAB,
        part=amounts.get('part'), years=amounts.get('years', []),
        options=amounts.get('options'), option=row['option'],
        due=due, paid=row['paid'], remaining=remaining,
        state=_state(
            order_state=order_state, ignored=row['ignored'], collected=collected,
            nothing=amounts['nothing'], choice_needed=amounts.get('choice_needed', False),  # noqa: E501
            remaining=remaining, paid=row['paid'],
        ),
        can_revert_paid=row['revert'],
        lines=[line.key for line in group], target_paid=row['paid'],
    )


def _sure_item(line: _Line, part: Decimal) -> FollowUpItem:
    collected, _ = line.collected()
    due = _round(part * collected / line.amount) if line.amount > 0 else ZERO
    return _item(line, [line], kind=KIND_SURE, part=part, due=due, nothing=part <= 0)


def _year(line: _Line) -> FollowUpYear:
    collected, _ = line.collected()
    calc, totals = line.calc, line.totals
    excluded = None
    if totals.status == TOTALS_BELOW_NISAB:
        excluded = YEAR_BELOW_NISAB
    elif totals.status != TOTALS_ABOVE_NISAB or totals.rate is None:
        excluded = YEAR_INCOMPLETE
    amount = None if excluded else _round(line.counted(collected) * totals.rate)
    return FollowUpYear(calc.pk, calc.hawl_calendar, calc.hawl_year, amount, excluded)


def _doubtful_item(group: list[_Line]) -> FollowUpItem:
    """Créance douteuse sur une ou plusieurs fiches (de la plus ancienne à la plus
    récente) : montant de chaque option D4, puis celui de l'option choisie."""
    origin = group[0]
    years = [_year(line) for line in group]
    counted = [y.amount for y in years if y.amount is not None]
    options = {
        ZakatReceivableFollowUp.OPTION_ALL_YEARS: sum(counted, ZERO),
        ZakatReceivableFollowUp.OPTION_ONE_YEAR: years[-1].amount or ZERO,
        ZakatReceivableFollowUp.OPTION_NEW_YEAR: ZERO,
    }
    option = origin.row.doubtful_option if origin.row else None
    return _item(
        origin, group, kind=KIND_DOUBTFUL, years=years, options=options,
        due=options[option] if option else ZERO,
        nothing=max(options.values()) <= 0, choice_needed=option is None,
    )


def _doubtful_groups(lines: list[_Line]) -> list[list[_Line]]:
    """Une commande douteuse sur plusieurs fiches forme un groupe ; une créance saisie
    à la main reste seule (rien ne la relie d'une fiche à l'autre)."""
    groups: dict[tuple[str, ...], list[_Line]] = {}
    for line in lines:
        order_id = line.item.get('order_id')
        key = ('order', str(order_id)) if order_id else ('line', *line.key)
        groups.setdefault(key, []).append(line)
    return list(groups.values())


def followup_items(shop: Shop, user: Any) -> list[FollowUpItem]:
    """Toutes les créances suivies de la personne, fiches les plus anciennes d'abord."""
    lines = _lines(shop, user)
    sure = [line for line in lines if not line.item.get('doubtful') and _is_on_collection(line)]  # noqa: E501
    parts = _sure_parts(sure)
    items = [_sure_item(line, parts[line.key]) for line in sure]
    doubtful = [line for line in lines if line.item.get('doubtful')]
    items += [_doubtful_item(group) for group in _doubtful_groups(doubtful)]
    return items


def actionable_items(shop: Shop, user: Any) -> list[FollowUpItem]:
    """Carte de l'accueil : choix D4 à faire ou zakat à verser (ignorées exclues)."""
    return [item for item in followup_items(shop, user) if item.state in ACTIONABLE_STATES]  # noqa: E501


def calculation_items(calc: ZakatCalculation) -> list[FollowUpItem]:
    """Créances suivies d'une fiche (Résultat, justificatif) : ses créances sûres
    « à l'encaissement » et les créances douteuses où elle figure."""
    key = str(calc.pk)
    return [
        item for item in followup_items(calc.shop, calc.user)
        if any(calc_id == key for calc_id, _ in item.lines)
    ]


# ── Actions de la personne ────────────────────────────────────────────────────

def _find(shop: Shop, user: Any, calculation_id: Any, line_id: Any) -> FollowUpItem:
    wanted = (str(calculation_id), str(line_id))
    for item in followup_items(shop, user):
        if wanted in item.lines:
            return item
    raise FollowUpNotFound()


def _target_row(shop: Shop, user: Any, item: FollowUpItem) -> ZakatReceivableFollowUp:
    """Ligne de suivi de la fiche d'origine, créée à la première action (défaite avec
    elle si l'écriture échoue). `get_or_create` rattrape la création concurrente."""
    row, _ = ZakatReceivableFollowUp.objects.get_or_create(
        shop=shop, user=user, calculation_id=item.calculation_id, line_id=item.line_id,
    )
    return row


def _write(shop: Shop, user: Any, item: FollowUpItem, action: str, *,
           condition: dict[str, Any] | None = None, **fields: Any) -> FollowUpItem:
    """UPDATE conditionnel de la ligne d'origine et journal (sans montant), dans une
    transaction ; 0 ligne → 409. Renvoie l'élément relu."""
    with transaction.atomic():
        row = _target_row(shop, user, item)
        updated = (
            ZakatReceivableFollowUp.objects.filter(pk=row.pk, shop=shop, user=user, **(condition or {}))  # noqa: E501
            .update(**fields, updated_at=timezone.now())
        )
        if not updated:
            raise FollowUpConflictError(_find(shop, user, item.calculation_id, item.line_id))  # noqa: E501
        log_action(
            shop_id=shop.pk, user=user, action=action,
            model_name='ZakatReceivableFollowUp', obj_id=row.pk,
            obj_repr=f'Zakat {hawl_label(item.hawl_calendar, item.hawl_year)}',
        )
    return _find(shop, user, item.calculation_id, item.line_id)


def choose_option(shop: Shop, user: Any, calculation_id: Any, line_id: Any, option: str) -> FollowUpItem:  # noqa: E501
    """Option D4 d'une créance douteuse encaissée, modifiable comme tout choix."""
    item = _find(shop, user, calculation_id, line_id)
    if item.kind != KIND_DOUBTFUL:
        raise FollowUpActionError('Ce choix concerne les créances douteuses.')
    return _write(shop, user, item, 'zakat_followup_option', doubtful_option=option)


def mark_collected(shop: Shop, user: Any, calculation_id: Any, line_id: Any, *,
                   collected_on: date, amount: Decimal) -> FollowUpItem:
    """« Encaissée » : date et montant d'une créance saisie à la main (une commande
    suit son propre reste dû). Entre le jour J de la fiche et aujourd'hui, au plus
    le montant de la ligne."""
    item = _find(shop, user, calculation_id, line_id)
    if item.order_id:
        raise FollowUpActionError("L'encaissement d'une commande suit son reste dû.")
    reference_date = (
        ZakatCalculation.objects.filter(shop=shop, user=user, pk=item.calculation_id)
        .values_list('reference_date', flat=True).get()
    )
    if not reference_date <= collected_on <= shop_today(shop):
        raise FollowUpActionError("Date entre le jour J de la fiche et aujourd'hui.")
    if amount > item.amount:
        raise FollowUpActionError('Le montant encaissé dépasse la créance.')
    return _write(
        shop, user, item, 'zakat_followup_collected',
        collected_amount=amount, collected_on=collected_on,
    )


def mark_paid(shop: Shop, user: Any, calculation_id: Any, line_id: Any, amount: Decimal) -> FollowUpItem:  # noqa: E501
    """« Marquer comme versée » : ajoute le reste à verser affiché à l'écran.

    Montant différent du reste recalculé → 409. Condition sur le versé lu : de deux
    demandes simultanées, une seule passe, l'autre reçoit 409."""
    item = _find(shop, user, calculation_id, line_id)
    if item.state != STATE_TO_PAY or item.remaining != amount:
        raise FollowUpConflictError(item)
    return _write(
        shop, user, item, 'zakat_followup_paid', condition={'paid_amount': item.target_paid},  # noqa: E501
        paid_amount=F('paid_amount') + amount, last_paid_amount=amount,
        last_paid_at=timezone.now(),
    )


def ignore(shop: Shop, user: Any, calculation_id: Any, line_id: Any) -> FollowUpItem:
    """« Ignorer » : la créance quitte la carte de l'accueil ; « Revenir » la remet."""
    item = _find(shop, user, calculation_id, line_id)
    return _write(
        shop, user, item, 'zakat_followup_ignored', condition={'ignored_at__isnull': True},  # noqa: E501
        ignored_at=timezone.now(),
    )


def revert(shop: Shop, user: Any, calculation_id: Any, line_id: Any, what: str) -> FollowUpItem:  # noqa: E501
    """« … par erreur ? Revenir » : défait le dernier versement, « Ignorer » ou
    « Encaissée ». Rien à défaire → 409."""
    item = _find(shop, user, calculation_id, line_id)
    if what == REVERT_PAID:
        changes = {
            'condition': {'last_paid_amount__gt': 0, 'paid_amount': item.target_paid},
            'paid_amount': F('paid_amount') - F('last_paid_amount'),
            'last_paid_amount': ZERO, 'last_paid_at': None,
        }
    elif what == REVERT_IGNORE:
        changes = {'condition': {'ignored_at__isnull': False}, 'ignored_at': None}
    else:
        changes = {
            'condition': {'collected_amount__isnull': False},
            'collected_amount': None, 'collected_on': None,
        }
    return _write(shop, user, item, 'zakat_followup_reverted', **changes)


def apply_action(shop: Shop, user: Any, calculation_id: Any, line_id: Any, data: dict[str, Any]) -> FollowUpItem:  # noqa: E501
    """Action validée par `ZakatFollowUpActionSerializer` → créance relue."""
    action = data['action']
    if action == ACTION_OPTION:
        return choose_option(shop, user, calculation_id, line_id, data['option'])
    if action == ACTION_COLLECTED:
        return mark_collected(
            shop, user, calculation_id, line_id,
            collected_on=data['collected_on'], amount=data['amount'],
        )
    if action == ACTION_PAID:
        return mark_paid(shop, user, calculation_id, line_id, data['amount'])
    if action == ACTION_IGNORE:
        return ignore(shop, user, calculation_id, line_id)
    return revert(shop, user, calculation_id, line_id, data['revert'])
