"""Faux client Stripe en mémoire, pour les tests uniquement (aucun appel réseau).

`FakeStripeClient` répond aux seuls appels faits par `stripe_sync`,
`stripe_events` et `stripe_billing` : lecture, liste, mise à jour et résiliation
d'abonnements, lecture de paiements, création de clients et de sessions
(Checkout, portail). Les objets sont construits par le SDK (`construct_from`) à
partir de dictionnaires, comme une vraie réponse de l'API. Les helpers signent
un corps de webhook comme Stripe (`t=<horodatage>,v1=<HMAC-SHA256>`).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from typing import Any

import stripe

FAKE_KEY = 'sk_test_fake_key_for_mizan_tests'


class _FakeResource:
    def __init__(self, resource: type[stripe.StripeObject], label: str) -> None:
        self.resource = resource
        self.label = label
        self.items: dict[str, dict[str, Any]] = {}
        self.failing: set[str] = set()
        self.calls: list[str] = []

    def retrieve(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.calls.append(id)
        if id in self.failing:
            raise stripe.APIConnectionError('Stripe injoignable (simulé).')
        if id not in self.items:
            raise stripe.InvalidRequestError(f'No such {self.label}', 'id', code='resource_missing')  # noqa: E501
        return self.resource.construct_from(self.items[id], FAKE_KEY)


class _FakeSubscriptions(_FakeResource):
    """Abonnements : `retrieve` (dans `calls`), puis `update`, `cancel`, `list`."""

    def __init__(self) -> None:
        super().__init__(stripe.Subscription, 'subscription')
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.cancels: list[str] = []
        self.listed: list[dict[str, Any]] = []

    def update(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.updates.append((id, dict(params or {})))
        data = self.items[id]
        if 'cancel_at_period_end' in params:
            data['cancel_at_period_end'] = params['cancel_at_period_end']
        if 'cancel_at' in params:
            data['cancel_at'] = params['cancel_at'] or None
        return self.resource.construct_from(data, FAKE_KEY)

    def cancel(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.cancels.append(id)
        self.items[id]['status'] = 'canceled'
        return self.resource.construct_from(self.items[id], FAKE_KEY)

    def list(self, params: Any = None, options: Any = None) -> Any:  # noqa: A003
        self.listed.append(dict(params or {}))
        mine = [d for d in self.items.values() if d['customer'] == params['customer']]
        mine.sort(key=lambda d: d.get('created', 0), reverse=True)
        return stripe.ListObject.construct_from({'object': 'list', 'data': mine}, FAKE_KEY)  # noqa: E501


class _FakeCreator:
    """`create` qui enregistre ses arguments ; même clé d'idempotence, même objet."""

    def __init__(self, resource: type[stripe.StripeObject], prefix: str) -> None:
        self.resource = resource
        self.prefix = prefix
        self.calls: list[tuple[dict[str, Any], dict[str, Any]]] = []
        self.error: stripe.StripeError | None = None
        self._by_key: dict[str, dict[str, Any]] = {}

    def create(self, params: Any = None, options: Any = None) -> Any:
        self.calls.append((dict(params or {}), dict(options or {})))
        if self.error is not None:
            raise self.error
        key = (options or {}).get('idempotency_key') or f'appel-{len(self.calls)}'
        if key not in self._by_key:
            object_id = f'{self.prefix}_{len(self._by_key) + 1}'
            url = f'https://stripe.test/{object_id}'
            self._by_key[key] = {'id': object_id, 'object': self.prefix, 'url': url}
        return self.resource.construct_from(self._by_key[key], FAKE_KEY)

    @property
    def last_params(self) -> dict[str, Any]:
        return self.calls[-1][0]


class FakeStripeClient:
    """Imite `StripeClient.v1` pour les abonnements, paiements et sessions."""

    def __init__(self) -> None:
        self.subscriptions = _FakeSubscriptions()
        self.charges = _FakeResource(stripe.Charge, 'charge')
        self.customers = _FakeCreator(stripe.Customer, 'cus')
        self.checkout = SimpleNamespace(sessions=_FakeCreator(stripe.checkout.Session, 'cs'))  # noqa: E501
        self.billing_portal = SimpleNamespace(
            sessions=_FakeCreator(stripe.billing_portal.Session, 'bps'),
        )
        self.v1 = self

    def put_subscription(self, data: dict[str, Any]) -> None:
        self.subscriptions.items[data['id']] = data

    def put_charge(self, charge_id: str, customer: str) -> None:
        self.charges.items[charge_id] = {
            'id': charge_id, 'object': 'charge', 'customer': customer,
        }


def subscription_data(
    sub_id: str,
    customer: str,
    *,
    status: str = 'active',
    product: str = 'mizan_solo',
    price: str = 'price_solo_month',
    periods: tuple[tuple[int, int], ...] = ((1_790_000_000, 1_792_592_000),),
    interval: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Abonnement Stripe (API récente : période portée par chaque item)."""
    price_data: dict[str, Any] = {'id': price, 'object': 'price', 'product': product}
    if interval is not None:
        price_data['recurring'] = {'interval': interval, 'interval_count': 1}
    items = [
        {
            'id': f'si_{sub_id}_{index}', 'object': 'subscription_item',
            'current_period_start': start, 'current_period_end': end,
            'price': dict(price_data),
        }
        for index, (start, end) in enumerate(periods)
    ]
    return {
        'id': sub_id, 'object': 'subscription', 'customer': customer,
        'status': status, 'cancel_at_period_end': False, 'cancel_at': None,
        'items': {'object': 'list', 'data': items},
        **extra,
    }


def event_body(event_id: str, event_type: str, obj: dict[str, Any]) -> bytes:
    """Corps JSON d'un événement Stripe, tel que reçu par le webhook."""
    return json.dumps({
        'id': event_id, 'object': 'event', 'type': event_type,
        'created': 1_790_000_000, 'api_version': stripe.api_version,
        'data': {'object': obj},
    }).encode()


def sign(body: bytes, secret: str, timestamp: int | None = None) -> str:
    """En-tête `Stripe-Signature` calculé comme Stripe."""
    timestamp = int(time.time()) if timestamp is None else timestamp
    signed = f'{timestamp}.{body.decode()}'.encode()
    digest = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return f't={timestamp},v1={digest}'
