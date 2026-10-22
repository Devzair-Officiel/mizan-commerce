"""Synchronisation des formules payantes avec le catalogue Stripe.

`SubscriptionPlan` reste la source de vérité des prix ; Stripe en est la copie.
Chaque formule payante active donne un produit d'identifiant stable
`mizan_<code>` et un ou deux prix repérés par leur `lookup_key`
(`<code>_monthly`, `<code>_yearly`). Idempotent : un prix conforme n'est jamais
recréé. Un prix modifié donne un NOUVEAU prix qui reprend la `lookup_key` ;
l'ancien reste actif, les abonnés existants gardent leur tarif.

Pas de `tax_behavior` : prix affichés sans mention HT (franchise en base de TVA).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import stripe
from django.db.models import QuerySet

from .models import SubscriptionPlan

PRODUCT_ID_PREFIX = 'mizan_'

INTERVAL_MONTH = 'month'
INTERVAL_YEAR = 'year'

ACTION_CREATED = 'créé'
ACTION_UPDATED = 'mis à jour'
ACTION_REPLACED = 'remplacé'
ACTION_UNCHANGED = 'inchangé'


@dataclass(frozen=True)
class PriceSync:
    """Résultat de la synchronisation d'un prix (id vide si rien n'a été créé)."""

    lookup_key: str
    amount_cents: int
    currency: str
    interval: str
    action: str
    price_id: str


@dataclass(frozen=True)
class PlanSync:
    """Résultat de la synchronisation d'une formule : son produit et ses prix."""

    plan_code: str
    product_id: str
    product_action: str
    prices: list[PriceSync] = field(default_factory=list)


def to_cents(amount: Decimal) -> int:
    """Montant en centimes, arrondi au plus proche (demi vers le haut), sans float."""
    return int((amount * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def product_id_for(plan: SubscriptionPlan) -> str:
    return f'{PRODUCT_ID_PREFIX}{plan.code}'


def plans_to_sync() -> QuerySet[SubscriptionPlan]:
    """Formules actives et payantes ; Découverte n'a rien à vendre."""
    return (
        SubscriptionPlan.objects.filter(is_active=True, price_amount__gt=0)
        .exclude(code=SubscriptionPlan.CODE_FREE)
        .order_by('price_amount')
    )


def sync_catalog(client: stripe.StripeClient, *, dry_run: bool) -> list[PlanSync]:
    """Aligne Stripe sur les formules ; `dry_run` n'écrit ni chez Stripe ni en base."""
    return [sync_plan(client, plan, dry_run=dry_run) for plan in plans_to_sync()]


def sync_plan(
    client: stripe.StripeClient, plan: SubscriptionPlan, *, dry_run: bool,
) -> PlanSync:
    product_id = product_id_for(plan)
    product_action = sync_product(client, plan, dry_run=dry_run)
    prices = [
        sync_price(
            client, plan, product_id,
            lookup_key=lookup_key, amount=amount, interval=interval, dry_run=dry_run,
        )
        for lookup_key, amount, interval in _wanted_prices(plan)
    ]
    if not dry_run:
        _store_price_ids(plan, prices)
    return PlanSync(plan.code, product_id, product_action, prices)


def sync_product(
    client: stripe.StripeClient, plan: SubscriptionPlan, *, dry_run: bool,
) -> str:
    """Crée le produit `mizan_<code>` s'il manque, met à jour nom et description."""
    product_id = product_id_for(plan)
    try:
        product = client.v1.products.retrieve(product_id)
    except stripe.InvalidRequestError as exc:
        if exc.code != 'resource_missing':
            raise
        if not dry_run:
            client.v1.products.create(params=_product_create_params(plan))
        return ACTION_CREATED
    if product.name == plan.name and (product.description or '') == plan.description:
        return ACTION_UNCHANGED
    if not dry_run:
        client.v1.products.update(
            product_id, params={'name': plan.name, 'description': plan.description},
        )
    return ACTION_UPDATED


def sync_price(
    client: stripe.StripeClient,
    plan: SubscriptionPlan,
    product_id: str,
    *,
    lookup_key: str,
    amount: Decimal,
    interval: str,
    dry_run: bool,
) -> PriceSync:
    """Garde le prix qui porte `lookup_key` s'il est conforme, sinon en crée un."""
    cents = to_cents(amount)
    currency = plan.currency.lower()
    current = _price_with_lookup_key(client, lookup_key)
    if current is not None and _price_matches(current, cents, currency, interval):
        return PriceSync(lookup_key, cents, currency, interval, ACTION_UNCHANGED, current.id)  # noqa: E501
    action = ACTION_CREATED if current is None else ACTION_REPLACED
    if dry_run:
        return PriceSync(lookup_key, cents, currency, interval, action, '')
    params: dict[str, Any] = {
        'product': product_id,
        'unit_amount': cents,
        'currency': currency,
        'recurring': {'interval': interval},
        'lookup_key': lookup_key,
        'metadata': {'plan_code': plan.code},
    }
    if current is not None:
        # La lookup_key passe au nouveau prix ; l'ancien reste actif.
        params['transfer_lookup_key'] = True
    price = client.v1.prices.create(params=params)
    return PriceSync(lookup_key, cents, currency, interval, action, price.id)


def _product_create_params(plan: SubscriptionPlan) -> dict[str, Any]:
    params: dict[str, Any] = {
        'id': product_id_for(plan),
        'name': plan.name,
        'metadata': {'plan_code': plan.code},
    }
    # Stripe refuse une description vide à la création.
    if plan.description:
        params['description'] = plan.description
    return params


def _wanted_prices(plan: SubscriptionPlan) -> list[tuple[str, Decimal, str]]:
    prices = [(f'{plan.code}_monthly', plan.price_amount, INTERVAL_MONTH)]
    if plan.price_yearly_amount > 0:
        prices.append((f'{plan.code}_yearly', plan.price_yearly_amount, INTERVAL_YEAR))
    return prices


def _price_with_lookup_key(
    client: stripe.StripeClient, lookup_key: str,
) -> stripe.Price | None:
    # Sans filtre `active` : une lookup_key restée sur un prix archivé doit être
    # transférée, sinon Stripe refuse de la donner au nouveau prix.
    found = client.v1.prices.list(params={'lookup_keys': [lookup_key], 'limit': 1})
    return found.data[0] if found.data else None


def _price_matches(
    price: stripe.Price, cents: int, currency: str, interval: str,
) -> bool:
    return (
        price.active
        and price.unit_amount == cents
        and price.currency == currency
        and price.recurring is not None
        and price.recurring.interval == interval
    )


def _store_price_ids(plan: SubscriptionPlan, prices: list[PriceSync]) -> None:
    ids = {price.interval: price.price_id for price in prices}
    plan.stripe_price_id = ids.get(INTERVAL_MONTH, '')
    # Plus de prix annuel → plus d'identifiant annuel à proposer.
    plan.stripe_price_id_yearly = ids.get(INTERVAL_YEAR, '')
    plan.save(update_fields=['stripe_price_id', 'stripe_price_id_yearly', 'updated_at'])
