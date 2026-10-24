"""Changement de formule d'un abonnement Stripe en cours (propriétaire seul).

Montée (formule plus chère, ou mensuel → annuel) : immédiate et au prorata.
Rien n'est débité sans confirmation : l'aperçu chiffré (`invoices.create_preview`)
fixe une date de prorata ; la confirmation recalcule l'aperçu à cette même date
et s'arrête avant tout débit si le montant diffère. La mise à jour reprend les
mêmes paramètres (`always_invoice`, même `proration_date`) : la facture créée
est celle de l'aperçu.

Descente (formule moins chère, ou annuel → mensuel) : programmée en fin de
période par un calendrier d'abonnement Stripe, sans facturation ni avoir.

Une montée abandonne le changement programmé en cours (calendrier libéré).
Comme dans `stripe_billing`, la `Subscription` locale n'est écrite que par
`stripe_sync`, après chaque appel à Stripe.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import stripe
from rest_framework import serializers

from .exceptions import (
    AmountChanged,
    CancellationScheduled,
    ChangeNotSupported,
    ConfirmationRequired,
    InvalidPlan,
    NoChange,
    NothingScheduled,
    PaymentActionRequired,
    PaymentFailed,
    PaymentOverdue,
    UseCheckoutOrChangePlan,
)
from .limits import shop_usage
from .models import Subscription, SubscriptionPlan
from .permissions import FEATURE_MIN_PLAN
from .stripe_billing import (
    _checkout_price,
    _client,
    _stripe_call,
    _subscription_of,
    has_live_stripe_subscription,
    release_schedule,
)
from .stripe_sync import (
    LIVE_STATUSES,
    audit_subscription,
    field_or_none,
    stripe_id,
    sync_subscription_from_stripe,
)

if TYPE_CHECKING:
    from apps.shops.models import Shop

logger = logging.getLogger(__name__)

IMMEDIATE = 'immediate'
SCHEDULED = 'scheduled'
MONTH, YEAR = SubscriptionPlan.PERIOD_MONTH, SubscriptionPlan.PERIOD_YEAR
# Durée de validité d'un aperçu : au-delà, la confirmation renvoie un nouvel aperçu.
PRORATION_MAX_AGE_SECONDS = 15 * 60
CENT = Decimal('0.01')
# Jauges de `shop_usage` → plafond correspondant de la formule.
PLAN_LIMITS = {
    'products': 'max_products',
    'orders_this_month': 'max_orders_per_month',
    'customers': 'max_customers',
    'members': 'max_members',
}
# Paiement à authentifier (3-D Secure) : codes d'erreur Stripe, puis motif de refus.
ACTION_REQUIRED_CODES = frozenset({
    'invoice_payment_intent_requires_action', 'payment_intent_action_required',
})
ACTION_REQUIRED_DECLINE = 'authentication_required'


@dataclass(frozen=True)
class _Change:
    """Changement demandé, sur un abonnement local fraîchement resynchronisé."""

    subscription: Subscription
    remote: Any
    item: Any
    target: SubscriptionPlan
    interval: str
    price: str
    kind: str


def classify_change(
    subscription: Subscription, target_plan: SubscriptionPlan, target_interval: str,
) -> str:
    """`immediate` ou `scheduled` ; erreur applicative si le changement est refusé.

    Rang des formules : prix mensuel (`price_amount`), jamais un ordre codé en dur.
    """
    current = subscription.plan
    if target_plan.code == SubscriptionPlan.CODE_FREE:
        raise InvalidPlan()
    if target_plan.pk == current.pk:
        if subscription.billing_interval == target_interval:
            raise NoChange()
        return IMMEDIATE if target_interval == YEAR else SCHEDULED
    if target_plan.price_amount < current.price_amount:
        return SCHEDULED
    # Même prix, formule différente : aucun rang pour trancher.
    yearly_to_monthly = subscription.billing_interval == YEAR and target_interval == MONTH  # noqa: E501
    if target_plan.price_amount == current.price_amount or yearly_to_monthly:
        raise ChangeNotSupported()
    return IMMEDIATE


def preview_plan_change(shop: Shop, plan_code: str, interval: str) -> dict[str, Any]:
    """Aperçu chiffré du changement ; sa `proration_date` sert à le confirmer."""
    client = _client()
    change = _change_context(client, shop, plan_code, interval)
    return _preview(client, change, _now())


def apply_plan_change(
    shop: Shop, plan_code: str, interval: str,
    expected_amount: str | None, proration_date: int | None,
) -> Subscription:
    """Montée confirmée (débit immédiat) ou descente programmée (aucun débit)."""
    client = _client()
    change = _change_context(client, shop, plan_code, interval)
    if change.kind == SCHEDULED:
        _schedule_change(client, change)
    else:
        _apply_immediate(client, change, expected_amount, proration_date)
    return _subscription_of(shop)


def cancel_scheduled_change(shop: Shop) -> Subscription:
    """Abandonne le changement programmé ; l'abonnement continue tel quel."""
    client = _client()
    subscription = _subscription_of(shop)
    if not has_live_stripe_subscription(subscription):
        raise NothingScheduled()
    sub_id = subscription.stripe_subscription_id
    with _stripe_call('annulation du changement programmé', subscription):
        remote = client.v1.subscriptions.retrieve(sub_id)
        released = release_schedule(client, subscription, remote)
        # Aussi sans calendrier : l'état local périmé est corrigé avant le refus.
        sync_subscription_from_stripe(client, sub_id)
    if not released:
        raise NothingScheduled()
    return _subscription_of(shop)


def lost_features(current: SubscriptionPlan, target: SubscriptionPlan) -> list[str]:
    """Fonctions incluses dans la formule actuelle et absentes de la cible."""
    order = SubscriptionPlan.TIER_ORDER
    return [
        feature for feature, minimum in FEATURE_MIN_PLAN.items()
        if target.tier < order.index(minimum) <= current.tier
    ]


def over_limits(shop: Shop, target: SubscriptionPlan) -> list[dict[str, Any]]:
    """Plafonds de la formule cible déjà dépassés par l'usage actuel."""
    exceeded = []
    for resource, counter in shop_usage(shop).items():
        limit = getattr(target, PLAN_LIMITS[resource])
        if limit is not None and counter['count'] > limit:
            exceeded.append({'resource': resource, 'usage': counter['count'], 'limit': limit})  # noqa: E501
    return exceeded


def _change_context(
    client: stripe.StripeClient, shop: Shop, plan_code: str, interval: str,
) -> _Change:
    price = _checkout_price(plan_code, interval)
    subscription = _subscription_of(shop)
    if not has_live_stripe_subscription(subscription):
        raise UseCheckoutOrChangePlan()
    with _stripe_call('changement de formule', subscription):
        remote = sync_subscription_from_stripe(client, subscription.stripe_subscription_id)  # noqa: E501
    subscription = _subscription_of(shop)
    if not has_live_stripe_subscription(subscription) or remote.status not in LIVE_STATUSES:  # noqa: E501
        raise UseCheckoutOrChangePlan()
    if subscription.status == Subscription.STATUS_PAST_DUE:
        raise PaymentOverdue()
    if subscription.cancel_at_period_end:
        raise CancellationScheduled()
    items = list(remote['items'].data)
    if len(items) != 1:
        raise ChangeNotSupported()
    target = SubscriptionPlan.objects.get(code=plan_code)
    kind = classify_change(subscription, target, interval)
    return _Change(subscription, remote, items[0], target, interval, price, kind)


def _preview(
    client: stripe.StripeClient, change: _Change, proration_date: int,
) -> dict[str, Any]:
    if change.kind == IMMEDIATE:
        return _immediate_preview(client, change, proration_date)
    period_end = change.subscription.current_period_end
    return _preview_payload(
        change, amount_cents=0, currency=change.target.currency,
        proration_date=proration_date, effective_at=period_end, renewal_at=period_end,
    )


def _immediate_preview(
    client: stripe.StripeClient, change: _Change, proration_date: int,
) -> dict[str, Any]:
    params = {
        'subscription': change.subscription.stripe_subscription_id,
        'subscription_details': _update_params(change, proration_date),
    }
    with _stripe_call('aperçu du changement', change.subscription):
        invoice = client.v1.invoices.create_preview(params=params)
    # Un avoir (montant négatif) n'est pas proposé : changement en deux étapes.
    if invoice.total < 0:
        raise ChangeNotSupported()
    ends = [line.period.end for line in invoice.lines.data]
    renewal = _at(max(ends)) if ends else change.subscription.current_period_end
    return _preview_payload(
        change, amount_cents=invoice.amount_due, currency=invoice.currency,
        proration_date=proration_date, effective_at=_at(proration_date),
        renewal_at=renewal,
    )


def _update_params(change: _Change, proration_date: int) -> dict[str, Any]:
    # Communs à l'aperçu et à la mise à jour : c'est ce qui garantit le même montant.
    return {
        'items': [{'id': change.item.id, 'price': change.price}],
        'proration_behavior': 'always_invoice',
        'proration_date': proration_date,
    }


def _preview_payload(
    change: _Change, *, amount_cents: int, currency: str, proration_date: int,
    effective_at: datetime | None, renewal_at: datetime | None,
) -> dict[str, Any]:
    subscription, target = change.subscription, change.target
    renewal_price = target.price_amount if change.interval == MONTH else target.price_yearly_amount  # noqa: E501
    return {
        'kind': change.kind,
        'current': {'plan': subscription.plan.code, 'interval': subscription.billing_interval},  # noqa: E501
        'target': {'plan': target.code, 'interval': change.interval},
        'amount_due_now': _money(Decimal(amount_cents) / 100),
        'currency': currency.upper(),
        'proration_date': proration_date,
        'effective_at': _iso(effective_at),
        'next_renewal': {'amount': _money(renewal_price), 'date': _iso(renewal_at)},
        'lost_features': lost_features(subscription.plan, target),
        'over_limits': over_limits(subscription.shop, target),
    }


def _apply_immediate(
    client: stripe.StripeClient, change: _Change,
    expected_amount: str | None, proration_date: int | None,
) -> None:
    if expected_amount is None or proration_date is None:
        raise ConfirmationRequired()
    now = _now()
    if not now - PRORATION_MAX_AGE_SECONDS <= proration_date <= now:
        raise AmountChanged(_preview(client, change, now))
    preview = _immediate_preview(client, change, proration_date)
    if Decimal(preview['amount_due_now']) != Decimal(expected_amount):
        raise AmountChanged(preview)
    subscription = change.subscription
    sub_id = subscription.stripe_subscription_id
    key = f'mizan-change-{subscription.pk}-{proration_date}-{change.price}'
    with _stripe_call('changement de formule', subscription):
        release_schedule(client, subscription, change.remote)
        with _payment_errors(client, subscription):
            client.v1.subscriptions.update(
                sub_id,
                params={**_update_params(change, proration_date), 'payment_behavior': 'error_if_incomplete'},  # noqa: E501
                options={'idempotency_key': key},
            )
        sync_subscription_from_stripe(client, sub_id)


@contextmanager
def _payment_errors(
    client: stripe.StripeClient, subscription: Subscription,
) -> Iterator[None]:
    """Paiement refusé ou à authentifier : 402, après resynchronisation."""
    try:
        yield
    except stripe.StripeError as exc:
        error = _payment_error(exc)
        if error is None:
            raise
        logger.warning(
            'Changement de formule de l\'abonnement %s : paiement non abouti (%s, code %s).',  # noqa: E501
            subscription.pk, type(exc).__name__, exc.code or '-',
        )
        # `error_if_incomplete` : Stripe n'applique pas la mise à jour ; on relit.
        sync_subscription_from_stripe(client, subscription.stripe_subscription_id)
        raise error from exc


def _payment_error(exc: stripe.StripeError) -> PaymentFailed | None:
    error = getattr(exc, 'error', None)
    decline = field_or_none(error, 'decline_code') if error is not None else None
    if exc.code in ACTION_REQUIRED_CODES or decline == ACTION_REQUIRED_DECLINE:
        return PaymentActionRequired()
    if isinstance(exc, stripe.CardError):
        return PaymentFailed()
    return None


def _schedule_change(client: stripe.StripeClient, change: _Change) -> None:
    subscription = change.subscription
    sub_id = subscription.stripe_subscription_id
    with _stripe_call('changement programmé', subscription):
        schedule_id = stripe_id(field_or_none(change.remote, 'schedule'))
        if schedule_id:
            # Un changement déjà programmé est remplacé, sur le même calendrier.
            schedule = client.v1.subscription_schedules.retrieve(schedule_id)
        else:
            schedule = client.v1.subscription_schedules.create(params={'from_subscription': sub_id})  # noqa: E501
        client.v1.subscription_schedules.update(
            schedule.id, params=_schedule_params(change, schedule),
        )
        audit_subscription(subscription, 'subscription_plan_changed', {
            'from': subscription.plan.code, 'to': change.target.code,
            'interval': change.interval, 'effective': 'period_end',
        })
        sync_subscription_from_stripe(client, sub_id)


def _schedule_params(change: _Change, schedule: Any) -> dict[str, Any]:
    """Phase en cours inchangée jusqu'à la fin de période, puis la nouvelle formule."""
    item = change.item
    quantity = field_or_none(item, 'quantity') or 1
    current = field_or_none(schedule, 'current_phase')
    start = current.start_date if current is not None else schedule.phases[0].start_date
    period_end = field_or_none(item, 'current_period_end')
    if period_end is None:
        raise ChangeNotSupported()
    return {
        'phases': [
            {
                'items': [{'price': stripe_id(item.price), 'quantity': quantity}],
                'start_date': start, 'end_date': period_end,
            },
            {
                'items': [{'price': change.price, 'quantity': quantity}],
                'duration': {'interval': change.interval, 'interval_count': 1},
                'proration_behavior': 'none',
            },
        ],
        'end_behavior': 'release',
        'proration_behavior': 'none',
    }


def _now() -> int:
    return int(time.time())


def _at(timestamp: int) -> datetime:
    return datetime.fromtimestamp(timestamp, tz=UTC)


def _iso(moment: datetime | None) -> str | None:
    return serializers.DateTimeField().to_representation(moment) if moment else None


def _money(amount: Decimal) -> str:
    return str(amount.quantize(CENT))
