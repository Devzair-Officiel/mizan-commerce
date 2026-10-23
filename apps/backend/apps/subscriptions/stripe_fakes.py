"""Faux client Stripe en mémoire, pour les tests uniquement (aucun appel réseau).

`FakeStripeClient` répond aux seuls appels faits par `stripe_sync`,
`stripe_events`, `stripe_billing` et `stripe_plan_change` : lecture, liste, mise
à jour et résiliation d'abonnements, lecture de paiements, création de clients et
de sessions (Checkout, portail), aperçu de facture et calendriers d'abonnement.
Les objets sont construits par le SDK (`construct_from`) à partir de
dictionnaires, comme une vraie réponse de l'API. Les helpers signent un corps
de webhook comme Stripe (`t=<horodatage>,v1=<HMAC-SHA256>`).
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
    """Abonnements : `retrieve` (dans `calls`), puis `update`, `cancel`, `list`.

    `update_error` fait échouer un changement de prix (paramètre `items`) sans
    rien modifier, comme `payment_behavior=error_if_incomplete`. `cancel_calls`
    garde paramètres et options de chaque résiliation ; `cancel_error` la fait
    échouer sans rien modifier.
    """

    def __init__(self, prices: dict[str, tuple[str, str]]) -> None:
        super().__init__(stripe.Subscription, 'subscription')
        self.prices = prices
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.update_options: list[dict[str, Any]] = []
        self.update_error: stripe.StripeError | None = None
        self.cancels: list[str] = []
        self.cancel_calls: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
        self.cancel_error: stripe.StripeError | None = None
        self.listed: list[dict[str, Any]] = []

    def update(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.updates.append((id, dict(params or {})))
        self.update_options.append(dict(options or {}))
        data = self.items[id]
        if 'items' in params:
            if self.update_error is not None:
                raise self.update_error
            for item in data['items']['data']:
                item['price'] = price_object(params['items'][0]['price'], self.prices)
        if 'cancel_at_period_end' in params:
            data['cancel_at_period_end'] = params['cancel_at_period_end']
        if 'cancel_at' in params:
            data['cancel_at'] = params['cancel_at'] or None
        return self.resource.construct_from(data, FAKE_KEY)

    def cancel(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.cancel_calls.append((id, dict(params or {}), dict(options or {})))
        if self.cancel_error is not None:
            raise self.cancel_error
        self.cancels.append(id)
        self.items[id]['status'] = 'canceled'
        return self.resource.construct_from(self.items[id], FAKE_KEY)

    def list(self, params: Any = None, options: Any = None) -> Any:  # noqa: A003
        self.listed.append(dict(params or {}))
        mine = [d for d in self.items.values() if d['customer'] == params['customer']]
        mine.sort(key=lambda d: d.get('created', 0), reverse=True)
        return stripe.ListObject.construct_from({'object': 'list', 'data': mine}, FAKE_KEY)  # noqa: E501


class _FakeInvoices:
    """Aperçu de facture : `amounts` (centimes) donne les montants successifs."""

    def __init__(self) -> None:
        self.previews: list[dict[str, Any]] = []
        self.amounts: list[int] = []
        self.amount_due = 1000
        self.total: int | None = None
        self.period_end = 1_792_592_000
        self.error: stripe.StripeError | None = None

    def create_preview(self, params: Any = None, options: Any = None) -> Any:
        self.previews.append(dict(params or {}))
        if self.error is not None:
            raise self.error
        amount = self.amounts.pop(0) if self.amounts else self.amount_due
        line = {
            'id': 'il_1', 'object': 'line_item',
            'period': {'start': 1_790_000_000, 'end': self.period_end},
        }
        return stripe.Invoice.construct_from({
            'object': 'invoice', 'amount_due': amount, 'currency': 'eur',
            'total': amount if self.total is None else self.total,
            'lines': {'object': 'list', 'data': [line]},
        }, FAKE_KEY)


class _FakeSchedules(_FakeResource):
    """Calendriers : `create` depuis l'abonnement, `update` des phases, `release`."""

    def __init__(self, client: FakeStripeClient) -> None:
        super().__init__(stripe.SubscriptionSchedule, 'subscription_schedule')
        self.client = client
        self.retrieve_params: list[dict[str, Any]] = []
        self.created: list[dict[str, Any]] = []
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.released: list[str] = []

    def retrieve(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.retrieve_params.append(dict(params or {}))
        return super().retrieve(id, params, options)

    def create(self, params: Any = None, options: Any = None) -> Any:
        self.created.append(dict(params or {}))
        sub = self.client.subscriptions.items[params['from_subscription']]
        item = sub['items']['data'][0]
        schedule_id = f'sub_sched_{len(self.created)}'
        phase = (item['current_period_start'], item['current_period_end'], item['price']['id'])  # noqa: E501
        self.client.put_schedule(schedule_data(schedule_id, sub['id'], [phase], self.client.prices))  # noqa: E501
        return self.resource.construct_from(self.items[schedule_id], FAKE_KEY)

    def update(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.updates.append((id, dict(params or {})))
        phases, start = [], 0
        for phase in params['phases']:
            begin = phase.get('start_date', start)
            start = phase.get('end_date') or begin + 30 * 86_400
            phases.append((begin, start, phase['items'][0]['price']))
        data = self.items[id]
        self.items[id] = schedule_data(id, data['subscription'], phases, self.client.prices)  # noqa: E501
        return self.resource.construct_from(self.items[id], FAKE_KEY)

    def release(self, id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002, E501
        self.released.append(id)
        data = self.items[id]
        data.update(status='released', current_phase=None)
        self.client.subscriptions.items[data['subscription']]['schedule'] = None
        return self.resource.construct_from(data, FAKE_KEY)


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
        # Prix connus : identifiant → (produit, rythme).
        self.prices: dict[str, tuple[str, str]] = {
            f'price_{code}_{interval}': (f'mizan_{code}', interval)
            for code in ('solo', 'boutique', 'commerce_plus')
            for interval in ('month', 'year')
        }
        self.subscriptions = _FakeSubscriptions(self.prices)
        self.invoices = _FakeInvoices()
        self.subscription_schedules = _FakeSchedules(self)
        self.charges = _FakeResource(stripe.Charge, 'charge')
        self.customers = _FakeCreator(stripe.Customer, 'cus')
        self.checkout = SimpleNamespace(sessions=_FakeCreator(stripe.checkout.Session, 'cs'))  # noqa: E501
        self.billing_portal = SimpleNamespace(
            sessions=_FakeCreator(stripe.billing_portal.Session, 'bps'),
        )
        self.v1 = self

    def put_subscription(self, data: dict[str, Any]) -> None:
        self.subscriptions.items[data['id']] = data

    def put_schedule(self, data: dict[str, Any]) -> None:
        """Calendrier rattaché à son abonnement (champ `schedule`)."""
        self.subscription_schedules.items[data['id']] = data
        self.subscriptions.items[data['subscription']]['schedule'] = data['id']

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


def price_object(price_id: str, prices: dict[str, tuple[str, str]]) -> dict[str, Any]:  # noqa: E501
    """Prix Stripe développé ; produit et rythme tirés de `prices` s'il y figure."""
    product, interval = prices.get(price_id, ('prod_inconnu', 'month'))
    return {
        'id': price_id, 'object': 'price', 'product': product,
        'recurring': {'interval': interval, 'interval_count': 1},
    }


def schedule_data(
    schedule_id: str,
    sub_id: str,
    phases: list[tuple[int, int, str]],
    prices: dict[str, tuple[str, str]],
    *,
    status: str = 'active',
) -> dict[str, Any]:
    """Calendrier d'abonnement ; la première phase est la phase en cours."""
    first = phases[0]
    return {
        'id': schedule_id, 'object': 'subscription_schedule',
        'subscription': sub_id, 'status': status, 'end_behavior': 'release',
        'current_phase': {'start_date': first[0], 'end_date': first[1]} if status == 'active' else None,  # noqa: E501
        'phases': [
            {
                'start_date': start, 'end_date': end,
                'items': [{'price': price_object(price, prices), 'quantity': 1}],
            }
            for start, end, price in phases
        ],
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
