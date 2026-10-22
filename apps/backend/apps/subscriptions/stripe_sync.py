"""Mise à jour d'un abonnement local à partir de Stripe, seule source de vérité.

L'état n'est jamais lu dans le contenu d'un événement : l'abonnement est
redemandé à Stripe, ce qui règle l'ordre de livraison et les écarts de version
d'API. Rattachement à une boutique par `Subscription.stripe_customer_id` (posé à
la création du client Stripe) ; un client inconnu ne modifie rien.

Écritures d'état par `update()` sous condition SQL ; le verrou de ligne ne sert
qu'à lire l'état d'avant, pour le journal d'audit.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Any

import stripe
from django.db import transaction
from django.utils import timezone

from apps.core.audit import log_action

from .models import Subscription, SubscriptionPlan
from .stripe_catalog import PRODUCT_ID_PREFIX

logger = logging.getLogger(__name__)

# Statuts Stripe qui gardent la formule payante. `trialing` devient `active` :
# le statut local `trialing` est réservé à l'essai Mizan (`expire_trials`).
LIVE_STATUSES: dict[str, str] = {
    'active': Subscription.STATUS_ACTIVE,
    'trialing': Subscription.STATUS_ACTIVE,
    'past_due': Subscription.STATUS_PAST_DUE,
    'unpaid': Subscription.STATUS_PAST_DUE,
}
STRIPE_CANCELED = 'canceled'


def stripe_id(value: Any) -> str:
    """Identifiant d'une référence Stripe, développée (objet) ou non (chaîne)."""
    if value is None:
        return ''
    return value if isinstance(value, str) else str(value.id)


def field_or_none(obj: Any, key: str) -> Any:
    """Champ d'un objet Stripe, `None` s'il est absent (selon la version d'API)."""
    return obj[key] if key in obj else None


def find_by_customer(customer_id: str) -> Subscription | None:
    """Abonnement local rattaché à ce client Stripe (jamais par une valeur vide)."""
    if not customer_id:
        return None
    return Subscription.objects.filter(stripe_customer_id=customer_id).first()


def sync_subscription_from_stripe(
    client: stripe.StripeClient, stripe_subscription_id: str,
) -> None:
    """Redemande l'abonnement à Stripe et aligne la `Subscription` locale."""
    remote = client.v1.subscriptions.retrieve(stripe_subscription_id)
    local = find_by_customer(stripe_id(remote.customer)) or (
        Subscription.objects.filter(stripe_subscription_id=remote.id).first()
    )
    if local is None:
        logger.warning('Abonnement Stripe %s : client inconnu, rien modifié.', remote.id)  # noqa: E501
        return
    if remote.status == STRIPE_CANCELED:
        _apply_canceled(local.pk, remote.id)
        return
    local_status = LIVE_STATUSES.get(remote.status)
    if local_status is None:
        logger.warning(
            'Abonnement Stripe %s : statut %s non pris en charge, rien modifié.',
            remote.id, remote.status,
        )
        return
    _apply_live(local.pk, remote_state(remote, local_status))


def remote_state(remote: Any, local_status: str) -> dict[str, Any]:
    """Champs locaux attendus d'après l'abonnement Stripe (formule si reconnue)."""
    items = list(remote['items'].data) if 'items' in remote else []
    state: dict[str, Any] = {
        'status': local_status,
        'stripe_subscription_id': remote.id,
        'cancel_at_period_end': bool(field_or_none(remote, 'cancel_at_period_end'))
        or field_or_none(remote, 'cancel_at') is not None,
    }
    for key, pick in (('current_period_start', min), ('current_period_end', max)):
        moment = _period_bound(remote, items, key, pick)
        if moment is not None:
            state[key] = moment
    plan = _plan_from_items(remote.id, items)
    if plan is not None:
        state['plan_id'] = plan.pk
    return state


def _period_bound(
    remote: Any, items: Sequence[Any], key: str, pick: Callable[[list[int]], int],
) -> datetime | None:
    # Depuis l'API 2025-03-31.basil, la période est portée par chaque item.
    values = [field_or_none(item, key) for item in items]
    timestamps = [value for value in values if value is not None]
    timestamp = pick(timestamps) if timestamps else field_or_none(remote, key)
    return datetime.fromtimestamp(timestamp, tz=UTC) if timestamp is not None else None


def _plan_from_items(remote_id: str, items: Sequence[Any]) -> SubscriptionPlan | None:
    # Formule déduite du produit, pas du prix : un ancien prix reste reconnu.
    product = stripe_id(items[0].price.product) if items else ''
    code = product.removeprefix(PRODUCT_ID_PREFIX) if product.startswith(PRODUCT_ID_PREFIX) else ''  # noqa: E501
    plan = SubscriptionPlan.objects.filter(code=code).first() if code else None
    if plan is None:
        logger.warning(
            'Abonnement Stripe %s : produit %s inconnu, formule inchangée.',
            remote_id, product or '(aucun)',
        )
    return plan


def _apply_live(pk: Any, state: dict[str, Any]) -> None:
    now = timezone.now()
    with transaction.atomic():
        before = Subscription.objects.select_for_update().select_related('plan').get(pk=pk)  # noqa: E501
        changes = {
            key: value for key, value in state.items()
            if getattr(before, key) != value
        }
        if changes:
            Subscription.objects.filter(pk=pk).update(**changes, updated_at=now)
        rows = Subscription.objects.filter(pk=pk)
        if state['status'] == Subscription.STATUS_PAST_DUE:
            rows.filter(past_due_since__isnull=True).update(past_due_since=now, updated_at=now)  # noqa: E501
        else:
            rows.filter(past_due_since__isnull=False).update(past_due_since=None, updated_at=now)  # noqa: E501
        if changes:
            _audit_live_changes(before, state)


def _apply_canceled(pk: Any, remote_id: str) -> None:
    # Seul l'abonnement Stripe rattaché peut ramener la boutique sur Découverte :
    # la fin d'un ancien abonnement, livrée en retard, ne touche pas au nouveau.
    now = timezone.now()
    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    with transaction.atomic():
        rows = Subscription.objects.filter(pk=pk, stripe_subscription_id=remote_id)
        before = rows.select_for_update().select_related('plan').first()
        if before is None:
            return
        rows.update(
            plan=free_plan, status=Subscription.STATUS_ACTIVE,
            stripe_subscription_id='', current_period_start=now,
            current_period_end=None, cancel_at_period_end=False,
            cancelled_at=now, past_due_since=None, updated_at=now,
        )
        audit_subscription(before, 'subscription_ended', {'from': before.plan.code, 'to': free_plan.code})  # noqa: E501


def _audit_live_changes(before: Subscription, state: dict[str, Any]) -> None:
    plan_id = state.get('plan_id', before.plan_id)
    plan_code = SubscriptionPlan.objects.values_list('code', flat=True).get(pk=plan_id)
    is_new = before.stripe_subscription_id != state['stripe_subscription_id']
    paid_and_active = (
        state['status'] == Subscription.STATUS_ACTIVE
        and plan_code != SubscriptionPlan.CODE_FREE
    )
    if is_new and paid_and_active:
        audit_subscription(before, 'subscription_started', {'plan': plan_code})
    elif plan_id != before.plan_id:
        audit_subscription(before, 'subscription_plan_changed', {'from': before.plan.code, 'to': plan_code})  # noqa: E501
    if state['cancel_at_period_end'] != before.cancel_at_period_end:
        action = 'subscription_cancel_scheduled' if state['cancel_at_period_end'] else 'subscription_cancel_reverted'  # noqa: E501
        audit_subscription(before, action, {})
    entering_past_due = before.status != Subscription.STATUS_PAST_DUE
    if state['status'] == Subscription.STATUS_PAST_DUE and entering_past_due:
        audit_subscription(before, 'subscription_payment_failed', {})


def audit_subscription(
    subscription: Subscription, action: str, changes: dict[str, str],
) -> None:
    """Journal de la boutique, sans auteur (Stripe) ni donnée de paiement."""
    log_action(
        shop_id=str(subscription.shop_id), user=None, action=action,
        model_name='Subscription', obj_id=subscription.pk,
        obj_repr=f'Abonnement {subscription.plan.name}', changes=changes,
    )
