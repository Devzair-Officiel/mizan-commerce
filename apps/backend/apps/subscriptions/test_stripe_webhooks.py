"""Webhook Stripe `POST /webhooks/stripe/` (lot 2).

Aucun appel réseau : signature HMAC calculée à la main (`stripe_fakes.sign`),
`get_client` remplacé par `FakeStripeClient`.
"""

from __future__ import annotations

import logging
from contextlib import ExitStack
from typing import Any
from unittest import mock

from django.http import HttpResponse
from django.test import TestCase, override_settings

from apps.core.models import AuditLog
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import StripeEvent, Subscription, SubscriptionPlan
from apps.subscriptions.stripe_fakes import (
    FAKE_KEY,
    FakeStripeClient,
    event_body,
    sign,
    subscription_data,
)

SECRET = 'whsec_test_mizan_webhook_secret'
URL = '/webhooks/stripe/'
BODY_MARKER = 'contenu-confidentiel-du-corps'


def _local(customer: str, sub_id: str = '', plan_code: str = 'solo') -> Subscription:
    plan = SubscriptionPlan.objects.get(code=plan_code)
    return SubscriptionFactory(
        plan=plan, stripe_customer_id=customer, stripe_subscription_id=sub_id,
    )


def _subscription_event(event_id: str, sub_id: str = 'sub_a', customer: str = 'cus_a') -> bytes:  # noqa: E501
    obj = {
        'id': sub_id, 'object': 'subscription', 'customer': customer,
        'status': 'active', 'metadata': {'note': BODY_MARKER},
    }
    return event_body(event_id, 'customer.subscription.updated', obj)


@override_settings(STRIPE_SECRET_KEY=FAKE_KEY, STRIPE_WEBHOOK_SECRET=SECRET)
class StripeWebhookTests(TestCase):
    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        patcher = mock.patch('apps.subscriptions.webhooks.get_client', return_value=self.stripe)  # noqa: E501
        patcher.start()
        self.addCleanup(patcher.stop)
        self.local = _local('cus_a', 'sub_a')
        self.stripe.put_subscription(subscription_data('sub_a', 'cus_a', status='past_due'))  # noqa: E501

    def _post(self, body: bytes, signature: str | None = None, secret: str = SECRET) -> HttpResponse:  # noqa: E501
        signature = sign(body, secret) if signature is None else signature
        headers = {'HTTP_STRIPE_SIGNATURE': signature} if signature else {}
        return self.client.post(URL, data=body, content_type='application/json', **headers)  # noqa: E501

    def test_missing_signature_is_rejected(self) -> None:
        response = self._post(_subscription_event('evt_1'), signature='')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'detail': 'Requête invalide.'})
        self.assertFalse(StripeEvent.objects.exists())

    def test_invalid_signature_is_rejected(self) -> None:
        response = self._post(_subscription_event('evt_1'), secret='whsec_autre')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(StripeEvent.objects.exists())
        self.assertEqual(self.stripe.subscriptions.calls, [])

    def test_signed_but_malformed_body_is_rejected(self) -> None:
        self.assertEqual(self._post(b'pas du json').status_code, 400)

    def test_unavailable_without_secrets(self) -> None:
        for settings in ({'STRIPE_WEBHOOK_SECRET': ''}, {'STRIPE_SECRET_KEY': ''}):
            with self.subTest(**settings), override_settings(**settings):
                response = self._post(_subscription_event('evt_1'))
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json(), {'detail': 'Service indisponible.'})
        self.assertFalse(StripeEvent.objects.exists())

    def test_get_is_not_allowed(self) -> None:
        self.assertEqual(self.client.get(URL).status_code, 405)

    def test_valid_event_syncs_from_stripe(self) -> None:
        response = self._post(_subscription_event('evt_1'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'received': True})
        self.local.refresh_from_db()
        # L'événement dit « active » : c'est l'état redemandé à Stripe qui compte.
        self.assertEqual(self.local.status, Subscription.STATUS_PAST_DUE)
        event = StripeEvent.objects.get(pk='evt_1')
        self.assertEqual(event.event_type, 'customer.subscription.updated')
        self.assertIsNotNone(event.processed_at)

    def test_duplicate_delivery_is_processed_once(self) -> None:
        body = _subscription_event('evt_1')
        self.assertEqual(self._post(body).status_code, 200)
        self.assertEqual(self._post(body).status_code, 200)
        self.assertEqual(self.stripe.subscriptions.calls, ['sub_a'])
        self.assertEqual(AuditLog.objects.filter(action='subscription_payment_failed').count(), 1)  # noqa: E501

    def test_failure_rolls_back_and_next_delivery_is_processed(self) -> None:
        self.stripe.subscriptions.failing.add('sub_a')
        body = _subscription_event('evt_1')
        response = self._post(body)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {'detail': 'Erreur de traitement.'})
        self.assertFalse(StripeEvent.objects.exists())
        self.local.refresh_from_db()
        self.assertEqual(self.local.status, Subscription.STATUS_ACTIVE)
        self.stripe.subscriptions.failing.clear()
        self.assertEqual(self._post(body).status_code, 200)
        self.local.refresh_from_db()
        self.assertEqual(self.local.status, Subscription.STATUS_PAST_DUE)
        self.assertIsNotNone(StripeEvent.objects.get(pk='evt_1').processed_at)

    def test_unhandled_type_is_accepted_and_recorded(self) -> None:
        body = event_body('evt_1', 'customer.created', {'id': 'cus_a', 'object': 'customer'})  # noqa: E501
        self.assertEqual(self._post(body).status_code, 200)
        self.assertIsNotNone(StripeEvent.objects.get(pk='evt_1').processed_at)
        self.assertEqual(self.stripe.subscriptions.calls, [])

    def test_unknown_customer_changes_nothing(self) -> None:
        self.stripe.put_subscription(subscription_data('sub_x', 'cus_inconnu', status='past_due'))  # noqa: E501
        body = _subscription_event('evt_1', sub_id='sub_x', customer='cus_inconnu')
        self.assertEqual(self._post(body).status_code, 200)
        self.local.refresh_from_db()
        self.assertEqual(self.local.status, Subscription.STATUS_ACTIVE)
        self.assertFalse(AuditLog.objects.exists())

    def test_invoice_syncs_the_customer_subscription(self) -> None:
        invoice = {'id': 'in_1', 'object': 'invoice', 'customer': 'cus_a'}
        body = event_body('evt_1', 'invoice.payment_failed', invoice)
        self.assertEqual(self._post(body).status_code, 200)
        self.local.refresh_from_db()
        self.assertEqual(self.local.status, Subscription.STATUS_PAST_DUE)
        self.assertEqual(self.stripe.subscriptions.calls, ['sub_a'])

    def test_invoice_without_local_stripe_subscription_changes_nothing(self) -> None:
        _local('cus_b')
        for n, customer in enumerate(('cus_b', 'cus_inconnu')):
            invoice = {'id': f'in_{n}', 'object': 'invoice', 'customer': customer}
            body = event_body(f'evt_{n}', 'invoice.paid', invoice)
            self.assertEqual(self._post(body).status_code, 200)
        self.assertEqual(self.stripe.subscriptions.calls, [])
        self.assertFalse(AuditLog.objects.exists())

    def test_dispute_is_audited_without_amounts(self) -> None:
        self.stripe.put_charge('ch_1', 'cus_a')
        dispute = {
            'id': 'dp_1', 'object': 'dispute', 'charge': 'ch_1',
            'amount': 1900, 'reason': 'fraudulent',
        }
        with self.assertLogs('apps.subscriptions', 'ERROR') as logs:
            body = event_body('evt_1', 'charge.dispute.created', dispute)
            response = self._post(body)
        self.assertEqual(response.status_code, 200)
        audit = AuditLog.objects.get(action='subscription_dispute')
        self.assertEqual(audit.changes, {'dispute': 'dp_1', 'charge': 'ch_1'})
        self.assertEqual(str(audit.shop_id), str(self.local.shop_id))
        self.assertNotIn('1900', '\n'.join(logs.output))

    def test_out_of_order_delivery_reaches_the_same_state(self) -> None:
        other = _local('cus_b', 'sub_b')
        for sub_id, customer in (('sub_a', 'cus_a'), ('sub_b', 'cus_b')):
            self.stripe.put_subscription(subscription_data(
                sub_id, customer, status='past_due', product='mizan_boutique',
                cancel_at_period_end=True,
            ))
        for event_id in ('evt_a2', 'evt_a1'):
            self._post(_subscription_event(event_id))
        for event_id in ('evt_b1', 'evt_b2'):
            self._post(_subscription_event(event_id, 'sub_b', 'cus_b'))
        fields = ('plan_id', 'status', 'cancel_at_period_end', 'current_period_end')
        self.local.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(
            [getattr(self.local, f) for f in fields],
            [getattr(other, f) for f in fields],
        )
        self.assertEqual(self.local.plan.code, SubscriptionPlan.CODE_BOUTIQUE)

    def test_other_shops_are_untouched(self) -> None:
        other = _local('cus_b', 'sub_b', plan_code='boutique')
        self.assertEqual(self._post(_subscription_event('evt_1')).status_code, 200)
        other.refresh_from_db()
        self.assertEqual(other.status, Subscription.STATUS_ACTIVE)
        self.assertEqual(other.plan.code, SubscriptionPlan.CODE_BOUTIQUE)
        self.assertFalse(AuditLog.objects.filter(shop_id=other.shop_id).exists())

    def test_logs_and_responses_carry_no_secret_body_or_signature(self) -> None:
        body = _subscription_event('evt_1')
        signature = sign(body, SECRET)
        forged = sign(b'{"autre": "corps"}', SECRET)
        with ExitStack() as stack:
            records = _capture_records(stack, ('apps', 'django.request', 'stripe'))
            responses = [self._post(body, signature=forged)]
            self.stripe.subscriptions.failing.add('sub_a')
            responses.append(self._post(body, signature=signature))
            self.stripe.subscriptions.failing.clear()
            responses.append(self._post(body, signature=signature))
        formatter = logging.Formatter()
        text = '\n'.join(formatter.format(record) for record in records)
        self.assertIn('evt_1', text)
        text += '\n'.join(r.content.decode() for r in responses)
        self.assertEqual([r.status_code for r in responses], [400, 500, 200])
        digests = [header.split('v1=')[1] for header in (signature, forged)]
        for leak in (SECRET, *digests, BODY_MARKER, FAKE_KEY):
            self.assertNotIn(leak, text)


def _capture_records(stack: ExitStack, names: tuple[str, ...]) -> list[Any]:
    """Enregistrements des loggers donnés, sans exiger qu'ils aient écrit."""
    records: list[logging.LogRecord] = []
    handler = logging.Handler(logging.DEBUG)
    handler.emit = records.append  # type: ignore[method-assign]
    for name in names:
        logger = logging.getLogger(name)
        previous = logger.level
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        stack.callback(logger.removeHandler, handler)
        stack.callback(logger.setLevel, previous)
    return records
