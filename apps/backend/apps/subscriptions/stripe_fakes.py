"""Faux client Stripe en mémoire, pour les tests uniquement (aucun appel réseau).

`FakeStripeClient` répond aux seuls appels faits par `stripe_sync` et
`stripe_events` : `v1.subscriptions.retrieve` et `v1.charges.retrieve`. Les
objets sont construits par le SDK (`construct_from`) à partir de dictionnaires,
comme une vraie réponse de l'API. Les helpers signent un corps de webhook comme
Stripe (`t=<horodatage>,v1=<HMAC-SHA256>`).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
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


class FakeStripeClient:
    """Imite `StripeClient.v1` pour les abonnements et les paiements."""

    def __init__(self) -> None:
        self.subscriptions = _FakeResource(stripe.Subscription, 'subscription')
        self.charges = _FakeResource(stripe.Charge, 'charge')
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
    **extra: Any,
) -> dict[str, Any]:
    """Abonnement Stripe (API récente : période portée par chaque item)."""
    items = [
        {
            'id': f'si_{sub_id}_{index}', 'object': 'subscription_item',
            'current_period_start': start, 'current_period_end': end,
            'price': {'id': price, 'object': 'price', 'product': product},
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
