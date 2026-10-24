"""Passage des abonnés Stripe au prix actuel du catalogue, en cas de baisse seulement.

Pour chaque `Subscription` liée à un abonnement Stripe, l'abonnement est
redemandé à Stripe ; formule (produit `mizan_<code>`) et rythme se lisent sur
son prix. Le prix de l'item est remplacé par celui du catalogue
(`SubscriptionPlan.stripe_price_id[_yearly]`, posé par `stripe_sync_plans`)
uniquement si le nouveau montant est strictement plus bas, sans prorata : la
baisse vaut à partir de la prochaine échéance. Une hausse demande une procédure
à part, avec préavis : elle est seulement signalée.

Laissés de côté, à traiter à la main ou plus tard : changement programmé
(calendrier Stripe), paiement en retard, résiliation faite ou programmée, statut
inattendu, plusieurs items. Une erreur Stripe ne concerne que son abonnement.
Les résultats ne portent que l'identifiant local : ni e-mail, ni nom, ni
identifiant Stripe ; une erreur Stripe n'en garde que le type et le code.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import stripe

from .models import Subscription, SubscriptionPlan
from .stripe_catalog import PRODUCT_ID_PREFIX, product_id_for, to_cents
from .stripe_sync import (
    field_or_none,
    price_interval,
    stripe_id,
    sync_subscription_from_stripe,
)

MIGRATED = 'migré'
TO_MIGRATE = 'à migrer'
IGNORED = 'ignoré'
FAILED = 'erreur'
MIGRATABLE_STATUSES = ('active', 'trialing')


@dataclass(frozen=True)
class PriceMigration:
    """Résultat pour une souscription locale."""

    subscription_id: str
    outcome: str
    detail: str


@dataclass(frozen=True)
class _Target:
    item_id: str
    price_id: str
    old_cents: int
    new_cents: int
    currency: str
    interval: str


class _Skip(Exception):
    """Abonnement laissé tel quel ; le message dit pourquoi."""


def migrate_prices(
    client: stripe.StripeClient, *, dry_run: bool,
) -> list[PriceMigration]:
    """Une ligne par souscription liée à Stripe, dans l'ordre des identifiants."""
    rows = (
        Subscription.objects.exclude(stripe_subscription_id='')
        .order_by('pk')
        .values_list('pk', 'stripe_subscription_id', 'scheduled_plan_code')
    )
    catalog: dict[str, Any] = {}
    results = []
    for pk, remote_id, scheduled in rows:
        local = str(pk)
        try:
            result = _migrate_one(client, local, remote_id, scheduled, catalog, dry_run)
        except _Skip as skip:
            result = PriceMigration(local, IGNORED, str(skip))
        except stripe.StripeError as exc:
            result = PriceMigration(local, FAILED, _error_detail(exc))
        results.append(result)
    return results


def _migrate_one(
    client: stripe.StripeClient, pk: str, remote_id: str, scheduled: str,
    catalog: dict[str, Any], dry_run: bool,
) -> PriceMigration:
    remote = client.v1.subscriptions.retrieve(remote_id)
    _check_migratable(remote, scheduled)
    target = _target(client, remote, catalog)
    detail = _amounts(target)
    if dry_run:
        return PriceMigration(pk, TO_MIGRATE, detail)
    client.v1.subscriptions.update(
        remote_id,
        params={
            'items': [{'id': target.item_id, 'price': target.price_id}],
            'proration_behavior': 'none',
        },
        options={'idempotency_key': f'mizan-price-migrate-{pk}-{target.price_id}'},  # noqa: E501
    )
    try:
        sync_subscription_from_stripe(client, remote_id)
    except stripe.StripeError as exc:
        # Prix déjà changé chez Stripe : le webhook de mise à jour resynchronisera.
        failure = f'resynchronisation en échec ({_error_detail(exc)})'
        return PriceMigration(pk, MIGRATED, f'{detail} ; {failure}')
    return PriceMigration(pk, MIGRATED, detail)


def _check_migratable(remote: Any, scheduled: str) -> None:
    status = remote.status
    if status in ('past_due', 'unpaid'):
        raise _Skip('paiement en retard')
    if status == 'canceled':
        raise _Skip('abonnement résilié')
    if status not in MIGRATABLE_STATUSES:
        raise _Skip(f'statut Stripe {status} non pris en charge')
    cancel_at = field_or_none(remote, 'cancel_at')
    if field_or_none(remote, 'cancel_at_period_end') or cancel_at is not None:
        raise _Skip('résiliation programmée')
    if scheduled or stripe_id(field_or_none(remote, 'schedule')):
        raise _Skip('changement de formule programmé : à traiter à la main')
    if 'items' not in remote or len(remote['items'].data) != 1:
        raise _Skip('abonnement sans item unique : à traiter à la main')


def _target(
    client: stripe.StripeClient, remote: Any, catalog: dict[str, Any],
) -> _Target:
    item = remote['items'].data[0]
    price = item.price
    plan, interval = _plan_and_interval(price)
    monthly = interval == SubscriptionPlan.PERIOD_MONTH
    price_id = plan.stripe_price_id if monthly else plan.stripe_price_id_yearly
    if not price_id:
        raise _Skip('catalogue non synchronisé (lancer stripe_sync_plans)')
    if price.id == price_id:
        raise _Skip('déjà au prix du catalogue')
    old_cents = field_or_none(price, 'unit_amount')
    if old_cents is None:
        raise _Skip('prix actuel inconnu')
    if price_id not in catalog:
        catalog[price_id] = client.v1.prices.retrieve(price_id)
    new = catalog[price_id]
    if not _matches_plan(new, plan, interval):
        raise _Skip('catalogue non synchronisé (lancer stripe_sync_plans)')
    if field_or_none(price, 'currency') != new.currency:
        raise _Skip('devise différente du catalogue : à traiter à la main')
    target = _Target(
        item.id, price_id, old_cents, new.unit_amount, new.currency, interval,
    )
    if new.unit_amount > old_cents:
        raise _Skip(f'hausse ({_amounts(target)}) : procédure à part, avec préavis')
    if new.unit_amount == old_cents:
        raise _Skip(f'même montant ({_amounts(target)})')
    return target


def _plan_and_interval(price: Any) -> tuple[SubscriptionPlan, str]:
    # Formule déduite du produit, comme `stripe_sync` : un ancien prix reste reconnu.
    product = stripe_id(field_or_none(price, 'product'))
    known = product.startswith(PRODUCT_ID_PREFIX)
    code = product.removeprefix(PRODUCT_ID_PREFIX) if known else ''
    paid = SubscriptionPlan.objects.exclude(code=SubscriptionPlan.CODE_FREE)
    plan = paid.filter(code=code).first() if code else None
    interval = price_interval(price)
    if plan is None or not interval:
        raise _Skip('prix inconnu (produit ou rythme non reconnu)')
    return plan, interval


def _matches_plan(price: Any, plan: SubscriptionPlan, interval: str) -> bool:
    """Prix du catalogue conforme à la formule : montant, devise, rythme, produit."""
    monthly = interval == SubscriptionPlan.PERIOD_MONTH
    amount = plan.price_amount if monthly else plan.price_yearly_amount
    return (
        field_or_none(price, 'unit_amount') == to_cents(amount)
        and price.currency == plan.currency.lower()
        and price_interval(price) == interval
        and stripe_id(field_or_none(price, 'product')) == product_id_for(plan)
    )


def _amounts(target: _Target) -> str:
    old, new = (Decimal(c).scaleb(-2) for c in (target.old_cents, target.new_cents))
    return f'{old} → {new} {target.currency.upper()} / {target.interval}'


def _error_detail(exc: stripe.StripeError) -> str:
    # Type et code seulement : le message de Stripe peut citer des identifiants.
    return f'erreur Stripe {type(exc).__name__}, code {exc.code or "-"}'
