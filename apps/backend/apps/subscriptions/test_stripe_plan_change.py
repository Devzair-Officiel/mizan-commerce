"""Changement de formule (lot 3b) : aperçu, montée immédiate, descente programmée.

Aucun appel réseau : `FakeStripeClient` (stripe_fakes.py) imite l'aperçu de
facture, la mise à jour d'abonnement et les calendriers d'abonnement, et
enregistre les paramètres envoyés à Stripe.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from contextlib import ExitStack
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import stripe
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.factories import UserFactory
from apps.core.models import AuditLog
from apps.shops.factories import ShopMemberFactory
from apps.subscriptions.exceptions import ChangeNotSupported, InvalidPlan, NoChange
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.permissions import FEATURE_MIN_PLAN
from apps.subscriptions.stripe_fakes import (
    FAKE_KEY,
    FakeStripeClient,
    schedule_data,
    subscription_data,
)
from apps.subscriptions.stripe_plan_change import IMMEDIATE, SCHEDULED, classify_change
from apps.subscriptions.stripe_sync import sync_subscription_from_stripe
from apps.subscriptions.test_stripe_billing import (
    LEAKY_MESSAGE,
    BillingTestCase,
    _shop_with_owner,
    _subscribe,
)
from apps.subscriptions.test_stripe_webhooks import _capture_records

PERIOD_START, PERIOD_END = 1_790_000_000, 1_792_592_000
NEXT_END = PERIOD_END + 365 * 86_400
PAYMENT_MESSAGE = (
    "Le paiement n'a pas abouti. Mettez à jour votre moyen de paiement depuis "
    'le portail puis réessayez.'
)
# Identifiants Stripe qui ne doivent jamais sortir (réponses, journaux).
STRIPE_IDS = ('sub_a', 'cus_a', 'si_sub_a', 'sub_sched', 'price_solo', 'price_boutique')
NO_SCHEDULED = ('', '', None)


def _at(timestamp: int) -> datetime:
    return datetime.fromtimestamp(timestamp, tz=UTC)


def _iso(timestamp: int) -> str:
    return serializers.DateTimeField().to_representation(_at(timestamp))


def _scheduled(subscription: Subscription) -> tuple[str, str, datetime | None]:
    subscription.refresh_from_db()
    return (
        subscription.scheduled_plan_code, subscription.scheduled_interval,
        subscription.scheduled_change_at,
    )


def _plan_changes() -> list[dict[str, Any]]:
    return list(
        AuditLog.objects.filter(action='subscription_plan_changed')
        .order_by('created_at').values_list('changes', flat=True),
    )


def _two_phases(client: FakeStripeClient, schedule_id: str, sub_id: str, current: str, target: str) -> None:  # noqa: E501
    """Calendrier : formule actuelle jusqu'à la fin de période, puis la cible."""
    phases = [(PERIOD_START, PERIOD_END, current), (PERIOD_END, NEXT_END, target)]
    client.put_schedule(schedule_data(schedule_id, sub_id, phases, client.prices))


class PlanChangeTestCase(BillingTestCase):
    """Boutique A ; prix Stripe posés pour les trois formules payantes."""

    def setUp(self) -> None:
        super().setUp()
        for code in ('boutique', 'commerce_plus'):
            SubscriptionPlan.objects.filter(code=code).update(
                stripe_price_id=f'price_{code}_month', stripe_price_id_yearly=f'price_{code}_year',  # noqa: E501
            )

    def _on(self, plan: str = 'solo', interval: str = 'month', status: str = 'active', **remote: Any) -> None:  # noqa: E501
        """Abonnement Stripe `sub_a` à `plan`/`interval`, localement et chez Stripe."""
        Subscription.objects.filter(pk=self.subscription.pk).update(
            plan=SubscriptionPlan.objects.get(code=plan), billing_interval=interval,
            status='past_due' if status == 'past_due' else 'active',
            stripe_customer_id='cus_a', stripe_subscription_id='sub_a',
        )
        self.stripe.put_subscription(subscription_data(
            'sub_a', 'cus_a', status=status, product=f'mizan_{plan}',
            price=f'price_{plan}_{interval}', interval=interval, **remote,
        ))

    def _preview(self, plan: str, interval: str) -> Any:
        return self._post('change-preview', {'plan': plan, 'interval': interval})

    def _change(self, plan: str, interval: str, **confirmation: Any) -> Any:
        return self._post('change', {'plan': plan, 'interval': interval, **confirmation})  # noqa: E501

    def _confirm(self, plan: str, interval: str) -> Any:
        """Aperçu puis confirmation du montant affiché, comme le ferait l'écran."""
        preview = self._preview(plan, interval).data
        return self._change(
            plan, interval, expected_amount=preview['amount_due_now'],
            proration_date=preview['proration_date'],
        )

    def _spy(self, *calls: tuple[Any, str]) -> list[str]:
        """Ordre des appels aux méthodes données du faux client Stripe."""
        order: list[str] = []
        for resource, name in calls:
            original = getattr(resource, name)

            def spy(*args: Any, _name: str = name, _original: Callable[..., Any] = original, **kwargs: Any) -> Any:  # noqa: E501
                order.append(_name)
                return _original(*args, **kwargs)

            setattr(resource, name, spy)
        return order


class ClassifyChangeTests(TestCase):
    def _classify(self, current: str, interval: str, target: str, target_interval: str) -> str:  # noqa: E501
        subscription = Subscription(
            plan=SubscriptionPlan.objects.get(code=current), billing_interval=interval,
        )
        return classify_change(subscription, SubscriptionPlan.objects.get(code=target), target_interval)  # noqa: E501

    def test_matrix(self) -> None:
        cases = (
            ('solo', 'month', 'boutique', 'month', IMMEDIATE),
            ('solo', 'month', 'commerce_plus', 'year', IMMEDIATE),
            ('solo', 'year', 'boutique', 'year', IMMEDIATE),
            ('solo', 'month', 'solo', 'year', IMMEDIATE),
            ('boutique', 'month', 'solo', 'month', SCHEDULED),
            ('commerce_plus', 'month', 'solo', 'year', SCHEDULED),
            ('boutique', 'year', 'solo', 'month', SCHEDULED),
            ('boutique', 'year', 'boutique', 'month', SCHEDULED),
        )
        for current, interval, target, target_interval, expected in cases:
            with self.subTest(current=current, interval=interval, target=target, to=target_interval):  # noqa: E501
                self.assertEqual(self._classify(current, interval, target, target_interval), expected)  # noqa: E501

    def test_refusals(self) -> None:
        cases = (
            ('solo', 'month', 'solo', 'month', NoChange),
            ('solo', 'year', 'boutique', 'month', ChangeNotSupported),
            ('boutique', 'month', 'free', 'month', InvalidPlan),
        )
        for current, interval, target, target_interval, error in cases:
            with self.subTest(current=current, interval=interval, target=target, to=target_interval):  # noqa: E501
                with self.assertRaises(error):
                    self._classify(current, interval, target, target_interval)

    def test_rank_comes_from_the_monthly_price(self) -> None:
        SubscriptionPlan.objects.filter(code='boutique').update(price_amount=Decimal('5.00'))  # noqa: E501
        self.assertEqual(self._classify('solo', 'month', 'boutique', 'month'), SCHEDULED)  # noqa: E501
        SubscriptionPlan.objects.filter(code='boutique').update(price_amount=Decimal('9.00'))  # noqa: E501
        with self.assertRaises(ChangeNotSupported):
            self._classify('solo', 'month', 'boutique', 'month')


class PreviewTests(PlanChangeTestCase):
    def test_kind_and_refusals_follow_the_rules(self) -> None:
        cases = (
            ('solo', 'month', 'boutique', 'month', 200, IMMEDIATE),
            ('solo', 'month', 'solo', 'year', 200, IMMEDIATE),
            ('boutique', 'month', 'solo', 'month', 200, SCHEDULED),
            ('solo', 'year', 'solo', 'month', 200, SCHEDULED),
            ('solo', 'month', 'solo', 'month', 400, 'no_change'),
            ('solo', 'year', 'boutique', 'month', 409, 'change_not_supported'),
        )
        for current, interval, target, target_interval, status, expected in cases:
            with self.subTest(current=current, interval=interval, target=target, to=target_interval):  # noqa: E501
                self._on(current, interval)
                response = self._preview(target, target_interval)
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.data['kind' if status == 200 else 'code'], expected)  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self.stripe.subscription_schedules.created, [])

    def test_immediate_preview(self) -> None:
        self._on()
        self.stripe.invoices.amount_due = 1234
        before = int(time.time())
        response = self._preview('boutique', 'month')
        self.assertEqual(response.status_code, 200)
        proration_date = response.data['proration_date']
        self.assertIsInstance(proration_date, int)
        self.assertTrue(before <= proration_date <= time.time())
        self.assertEqual(response.json(), {
            'kind': IMMEDIATE,
            'current': {'plan': 'solo', 'interval': 'month'},
            'target': {'plan': 'boutique', 'interval': 'month'},
            'amount_due_now': '12.34', 'currency': 'EUR',
            'proration_date': proration_date, 'effective_at': _iso(proration_date),
            'next_renewal': {'amount': '19.00', 'date': _iso(PERIOD_END)},
            'lost_features': [], 'over_limits': [],
        })
        self.assertEqual(self.stripe.invoices.previews, [{
            'subscription': 'sub_a',
            'subscription_details': {
                'items': [{'id': 'si_sub_a_0', 'price': 'price_boutique_month'}],
                'proration_behavior': 'always_invoice', 'proration_date': proration_date,  # noqa: E501
            },
        }])
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_yearly_renewal_uses_the_yearly_price(self) -> None:
        self._on()
        response = self._preview('solo', 'year')
        self.assertEqual(response.data['next_renewal']['amount'], '90.00')
        self.assertEqual(self.stripe.invoices.previews[0]['subscription_details']['items'][0]['price'], 'price_solo_year')  # noqa: E501

    def test_negative_immediate_total_is_refused(self) -> None:
        self._on()
        self.stripe.invoices.total = -500
        response = self._preview('boutique', 'month')
        self.assertEqual((response.status_code, response.data['code']), (409, 'change_not_supported'))  # noqa: E501

    def test_scheduled_preview_lists_what_is_lost(self) -> None:
        self._on('boutique', 'month')
        for email in ('a@example.com', 'b@example.com'):
            ShopMemberFactory(shop=self.shop, user=UserFactory(email=email), role='staff')  # noqa: E501
        response = self._preview('solo', 'month')
        self.assertEqual(response.status_code, 200)
        lost = [feature for feature, minimum in FEATURE_MIN_PLAN.items() if minimum == 'boutique']  # noqa: E501
        self.assertEqual(response.json(), {
            'kind': SCHEDULED,
            'current': {'plan': 'boutique', 'interval': 'month'},
            'target': {'plan': 'solo', 'interval': 'month'},
            'amount_due_now': '0.00', 'currency': 'EUR',
            'proration_date': response.data['proration_date'],
            'effective_at': _iso(PERIOD_END),
            'next_renewal': {'amount': '9.00', 'date': _iso(PERIOD_END)},
            'lost_features': lost,
            'over_limits': [{'resource': 'members', 'usage': 3, 'limit': 1}],
        })
        self.assertEqual(self.stripe.invoices.previews, [])
        self.assertEqual(self.stripe.subscription_schedules.created, [])


class ImmediateChangeTests(PlanChangeTestCase):
    def test_confirmed_amount_is_charged_with_the_previewed_parameters(self) -> None:
        self._on()
        preview = self._preview('boutique', 'month').data
        proration_date = preview['proration_date']
        response = self._change(
            'boutique', 'month', expected_amount='10.00', proration_date=proration_date,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['plan']['code'], 'boutique')
        details = {
            'items': [{'id': 'si_sub_a_0', 'price': 'price_boutique_month'}],
            'proration_behavior': 'always_invoice', 'proration_date': proration_date,
        }
        # Aperçu recalculé à la même date avant la mise à jour, aux mêmes paramètres.
        self.assertEqual([p['subscription_details'] for p in self.stripe.invoices.previews], [details] * 2)  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.updates, [
            ('sub_a', {**details, 'payment_behavior': 'error_if_incomplete'}),
        ])
        key = f'mizan-change-{self.subscription.pk}-{proration_date}-price_boutique_month'  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.update_options, [{'idempotency_key': key}])  # noqa: E501
        self.assertEqual(self._reload().plan.code, 'boutique')
        # Un seul audit : celui de la synchronisation.
        self.assertEqual(_plan_changes(), [{'from': 'solo', 'to': 'boutique'}])

    def test_monthly_to_yearly_is_immediate(self) -> None:
        self._on()
        self.assertEqual(self._confirm('solo', 'year').status_code, 200)
        self.assertEqual(self._reload().billing_interval, 'year')

    def test_changed_amount_stops_before_any_charge(self) -> None:
        self._on()
        self.stripe.invoices.amounts = [1000, 1200]
        response = self._confirm('boutique', 'month')
        self.assertEqual((response.status_code, response.data['code']), (409, 'amount_changed'))  # noqa: E501
        self.assertEqual(response.data['preview']['amount_due_now'], '12.00')
        self.assertEqual(response.data['preview']['kind'], IMMEDIATE)
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self._reload().plan.code, 'solo')

    def test_amount_sent_by_the_client_must_match(self) -> None:
        self._on()
        proration_date = self._preview('boutique', 'month').data['proration_date']
        response = self._change('boutique', 'month', expected_amount='9.99', proration_date=proration_date)  # noqa: E501
        self.assertEqual((response.status_code, response.data['code']), (409, 'amount_changed'))  # noqa: E501
        self.assertEqual(response.data['preview']['amount_due_now'], '10.00')
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_stale_or_future_proration_date_gets_a_new_preview(self) -> None:
        self._on()
        now = int(time.time())
        for proration_date in (now - 16 * 60, now + 60):
            with self.subTest(proration_date=proration_date - now):
                response = self._change('boutique', 'month', expected_amount='10.00', proration_date=proration_date)  # noqa: E501
                self.assertEqual((response.status_code, response.data['code']), (409, 'amount_changed'))  # noqa: E501
                fresh = response.data['preview']['proration_date']
                self.assertTrue(now <= fresh <= time.time())
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_confirmation_is_required(self) -> None:
        self._on()
        for confirmation in ({}, {'expected_amount': '10.00'}, {'proration_date': int(time.time())}):  # noqa: E501
            with self.subTest(confirmation=confirmation):
                response = self._change('boutique', 'month', **confirmation)
                self.assertEqual((response.status_code, response.data['code']), (400, 'confirmation_required'))  # noqa: E501
        self.assertEqual(self.stripe.invoices.previews, [])
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_invalid_payloads_are_rejected(self) -> None:
        self._on()
        payloads = (
            *({'plan': 'boutique', 'interval': 'month', 'expected_amount': amount, 'proration_date': 1}  # noqa: E501
              for amount in ('10', '10.5', '-1.00', 'abc')),
            {'plan': 'boutique'},
            {'plan': 'free', 'interval': 'month'},
            {'plan': 'boutique', 'interval': 'month', 'plan_code': 'free'},
            {'plan': 'boutique', 'interval': 'week'},
        )
        for payload in payloads:
            with self.subTest(payload=payload):
                self.assertEqual(self._post('change', payload).status_code, 400)
        self.assertEqual(self.stripe.subscriptions.calls, [])


class PaymentFailureTests(PlanChangeTestCase):
    def test_payment_errors(self) -> None:
        action = stripe.CardError(
            'Authentification requise.', None, 'card_declined',
            json_body={'error': {'code': 'card_declined', 'decline_code': 'authentication_required'}},  # noqa: E501
        )
        cases = (
            (stripe.CardError('Carte refusée.', None, 'card_declined'), 402, 'payment_failed'),  # noqa: E501
            (stripe.CardError('Fonds insuffisants.', None, 'insufficient_funds'), 402, 'payment_failed'),  # noqa: E501
            (action, 402, 'payment_action_required'),
            (stripe.InvalidRequestError('3DS', None, code='invoice_payment_intent_requires_action'), 402, 'payment_action_required'),  # noqa: E501
            (stripe.InvalidRequestError('Prix', 'items', code='resource_missing'), 502, 'payment_provider_error'),  # noqa: E501
            (stripe.APIConnectionError('Stripe injoignable.'), 502, 'payment_provider_error'),  # noqa: E501
        )
        for error, status, code in cases:
            with self.subTest(code=code, error=type(error).__name__), self.assertLogs('apps.subscriptions', 'WARNING'):  # noqa: E501
                self._on()
                self.stripe.subscriptions.update_error = error
                proration_date = self._preview('boutique', 'month').data['proration_date']  # noqa: E501
                reads = len(self.stripe.subscriptions.calls)
                response = self._change('boutique', 'month', expected_amount='10.00', proration_date=proration_date)  # noqa: E501
                self.assertEqual((response.status_code, response.data['code']), (status, code))  # noqa: E501
                # 402 : abonnement relu une seconde fois, après l'échec du paiement.
                rereads = 2 if status == 402 else 1
                self.assertEqual(len(self.stripe.subscriptions.calls) - reads, rereads)
                if status == 402:
                    self.assertEqual(response.data['detail'], PAYMENT_MESSAGE)
                subscription = self._reload()
                self.assertEqual((subscription.plan.code, subscription.billing_interval), ('solo', 'month'))  # noqa: E501
        self.assertEqual(_plan_changes(), [])


class ScheduledChangeTests(PlanChangeTestCase):
    def test_downgrade_is_scheduled_without_charge(self) -> None:
        self._on('boutique', 'month')
        response = self._change('solo', 'month')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['scheduled_change'], {'plan': 'solo', 'interval': 'month', 'at': _iso(PERIOD_END)})  # noqa: E501
        schedules = self.stripe.subscription_schedules
        self.assertEqual(schedules.created, [{'from_subscription': 'sub_a'}])
        self.assertEqual(schedules.updates, [('sub_sched_1', {
            'phases': [
                {
                    'items': [{'price': 'price_boutique_month', 'quantity': 1}],
                    'start_date': PERIOD_START, 'end_date': PERIOD_END,
                },
                {
                    'items': [{'price': 'price_solo_month', 'quantity': 1}],
                    'duration': {'interval': 'month', 'interval_count': 1},
                    'proration_behavior': 'none',
                },
            ],
            'end_behavior': 'release', 'proration_behavior': 'none',
        })])
        self.assertEqual(self.stripe.invoices.previews, [])
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self._reload().plan.code, 'boutique')
        self.assertEqual(_plan_changes(), [
            {'from': 'boutique', 'to': 'solo', 'interval': 'month', 'effective': 'period_end'},  # noqa: E501
        ])
        for leak in STRIPE_IDS:
            self.assertNotIn(leak, response.content.decode())

    def test_yearly_to_monthly_is_scheduled(self) -> None:
        self._on('solo', 'year')
        response = self._change('solo', 'month')
        self.assertEqual(response.data['scheduled_change']['interval'], 'month')
        phases = self.stripe.subscription_schedules.updates[0][1]['phases']
        self.assertEqual([p['items'][0]['price'] for p in phases], ['price_solo_year', 'price_solo_month'])  # noqa: E501
        self.assertEqual(self._reload().billing_interval, 'year')

    def test_new_scheduled_change_replaces_the_previous_one(self) -> None:
        self._on('commerce_plus', 'month')
        self._change('boutique', 'month')
        response = self._change('solo', 'year')
        self.assertEqual(response.data['scheduled_change'], {'plan': 'solo', 'interval': 'year', 'at': _iso(PERIOD_END)})  # noqa: E501
        schedules = self.stripe.subscription_schedules
        self.assertEqual(len(schedules.created), 1)
        self.assertEqual([schedule_id for schedule_id, _ in schedules.updates], ['sub_sched_1'] * 2)  # noqa: E501
        self.assertEqual(schedules.released, [])

    def test_upgrade_releases_the_scheduled_change_first(self) -> None:
        self._on('boutique', 'month')
        self._change('solo', 'month')
        order = self._spy((self.stripe.subscription_schedules, 'release'), (self.stripe.subscriptions, 'update'))  # noqa: E501
        response = self._confirm('commerce_plus', 'month')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(order, ['release', 'update'])
        self.assertIsNone(response.data['scheduled_change'])
        self.assertEqual(_scheduled(self.subscription), NO_SCHEDULED)
        self.assertEqual(self._reload().plan.code, 'commerce_plus')
        self.assertIn({'scheduled_cancelled': True}, _plan_changes())

    def test_cancel_scheduled_change(self) -> None:
        self._on('boutique', 'month')
        self._change('solo', 'month')
        response = self._post('scheduled-change-cancel')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['scheduled_change'])
        self.assertEqual(self.stripe.subscription_schedules.released, ['sub_sched_1'])
        self.assertEqual(_scheduled(self.subscription), NO_SCHEDULED)
        self.assertEqual(self._reload().plan.code, 'boutique')
        self.assertEqual(_plan_changes()[-1], {'scheduled_cancelled': True})
        again = self._post('scheduled-change-cancel')
        self.assertEqual((again.status_code, again.data['code']), (409, 'nothing_scheduled'))  # noqa: E501
        self.assertEqual(self.stripe.subscription_schedules.released, ['sub_sched_1'])
        self.assertEqual(len(_plan_changes()), 2)

    def test_cancel_without_stripe_subscription(self) -> None:
        response = self._post('scheduled-change-cancel')
        self.assertEqual((response.status_code, response.data['code']), (409, 'nothing_scheduled'))  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.calls, [])


class CancellationWithScheduleTests(PlanChangeTestCase):
    def test_cancellation_releases_the_schedule_first(self) -> None:
        self._on('boutique', 'month')
        self._change('solo', 'month')
        order = self._spy((self.stripe.subscription_schedules, 'release'), (self.stripe.subscriptions, 'update'))  # noqa: E501
        response = self._post('cancel')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(order, ['release', 'update'])
        self.assertEqual(self.stripe.subscriptions.updates[-1], ('sub_a', {'cancel_at_period_end': True}))  # noqa: E501
        subscription = self._reload()
        self.assertTrue(subscription.cancel_at_period_end)
        self.assertEqual(_scheduled(subscription), NO_SCHEDULED)
        self.assertEqual(_plan_changes()[-1], {'scheduled_cancelled': True})

    def test_past_due_cancellation_releases_the_schedule_first(self) -> None:
        self._on('boutique', 'month', status='past_due')
        _two_phases(self.stripe, 'sub_sched_9', 'sub_a', 'price_boutique_month', 'price_solo_month')  # noqa: E501
        order = self._spy((self.stripe.subscription_schedules, 'release'), (self.stripe.subscriptions, 'cancel'))  # noqa: E501
        self.assertEqual(self._post('cancel').status_code, 200)
        self.assertEqual(order, ['release', 'cancel'])
        self.assertEqual(self._reload().plan.code, 'free')


class RefusalTests(PlanChangeTestCase):
    def test_refused_before_any_stripe_write(self) -> None:
        cases = (
            ({'status': 'past_due'}, 409, 'payment_overdue'),
            ({'cancel_at_period_end': True}, 409, 'cancellation_scheduled'),
            ({'periods': ((PERIOD_START, PERIOD_END),) * 2}, 409, 'change_not_supported'),  # noqa: E501
            ({'status': 'canceled'}, 400, 'use_checkout_or_change_plan'),
        )
        for remote, status, code in cases:
            with self.subTest(code=code):
                self._on(**remote)
                confirmed = {'expected_amount': '10.00', 'proration_date': int(time.time())}  # noqa: E501
                for response in (self._preview('boutique', 'month'), self._change('boutique', 'month', **confirmed)):  # noqa: E501
                    self.assertEqual((response.status_code, response.data['code']), (status, code))  # noqa: E501
        self.assertEqual(self.stripe.invoices.previews, [])
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self.stripe.subscription_schedules.created, [])

    def test_without_stripe_subscription_checkout_is_required(self) -> None:
        for response in (self._preview('solo', 'month'), self._change('solo', 'month')):
            self.assertEqual((response.status_code, response.data['code']), (400, 'use_checkout_or_change_plan'))  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.calls, [])


class ScheduledStateSyncTests(TestCase):
    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        plan = SubscriptionPlan.objects.get(code='boutique')
        self.local = SubscriptionFactory(plan=plan, stripe_customer_id='cus_a', stripe_subscription_id='sub_a')  # noqa: E501
        self.stripe.put_subscription(subscription_data(
            'sub_a', 'cus_a', product='mizan_boutique', price='price_boutique_month', interval='month',  # noqa: E501
        ))

    def _sync(self) -> tuple[str, str, datetime | None]:
        sync_subscription_from_stripe(self.stripe, 'sub_a')
        return _scheduled(self.local)

    def test_without_schedule_nothing_is_read(self) -> None:
        self.assertEqual(self._sync(), NO_SCHEDULED)
        self.assertEqual(self.stripe.subscription_schedules.calls, [])

    def test_next_phase_is_copied_then_cleared(self) -> None:
        _two_phases(self.stripe, 'sub_sched_1', 'sub_a', 'price_boutique_month', 'price_solo_year')  # noqa: E501
        self.assertEqual(self._sync(), ('solo', 'year', _at(PERIOD_END)))
        self.assertEqual(self.stripe.subscription_schedules.retrieve_params, [{'expand': ['phases.items.price']}])  # noqa: E501
        self.stripe.subscription_schedules.release('sub_sched_1')
        self.assertEqual(self._sync(), NO_SCHEDULED)
        self.assertEqual(self.local.plan.code, 'boutique')

    def test_schedule_without_readable_next_phase_is_ignored(self) -> None:
        single = [(PERIOD_START, PERIOD_END, 'price_boutique_month')]
        self.stripe.put_schedule(schedule_data('sub_sched_1', 'sub_a', single, self.stripe.prices))  # noqa: E501
        self.assertEqual(self._sync(), NO_SCHEDULED)
        phases = [(PERIOD_START, PERIOD_END, 'price_boutique_month'), (PERIOD_END, NEXT_END, 'price_solo_month')]  # noqa: E501
        self.stripe.put_schedule(schedule_data('sub_sched_2', 'sub_a', phases, self.stripe.prices, status='not_started'))  # noqa: E501
        self.assertEqual(self._sync(), NO_SCHEDULED)
        _two_phases(self.stripe, 'sub_sched_3', 'sub_a', 'price_boutique_month', 'price_inconnu')  # noqa: E501
        with self.assertLogs('apps.subscriptions.stripe_sync', 'WARNING'):
            self.assertEqual(self._sync(), NO_SCHEDULED)

    def test_end_of_subscription_clears_the_scheduled_change(self) -> None:
        Subscription.objects.filter(pk=self.local.pk).update(
            scheduled_plan_code='solo', scheduled_interval='month', scheduled_change_at=timezone.now(),  # noqa: E501
        )
        self.stripe.put_subscription(subscription_data('sub_a', 'cus_a', status='canceled'))  # noqa: E501
        self.assertEqual(self._sync(), NO_SCHEDULED)


class AccessAndLeakTests(PlanChangeTestCase):
    def test_current_exposes_the_scheduled_change_without_stripe_ids(self) -> None:
        response = self.api.get(reverse('subscription-current'))
        self.assertIsNone(response.data['scheduled_change'])
        Subscription.objects.filter(pk=self.subscription.pk).update(
            stripe_customer_id='cus_a', stripe_subscription_id='sub_a',
            scheduled_plan_code='solo', scheduled_interval='year',
            scheduled_change_at=_at(PERIOD_END),
        )
        response = self.api.get(reverse('subscription-current'))
        self.assertEqual(response.data['scheduled_change'], {'plan': 'solo', 'interval': 'year', 'at': _iso(PERIOD_END)})  # noqa: E501
        for leak in STRIPE_IDS:
            self.assertNotIn(leak, response.content.decode())

    def test_only_the_owner_can_preview_change_or_cancel(self) -> None:
        self._on()
        admin, staff = UserFactory(email='admin@example.com'), UserFactory(email='staff@example.com')  # noqa: E501
        ShopMemberFactory(shop=self.shop, user=admin, role='admin')
        ShopMemberFactory(shop=self.shop, user=staff, role='staff')
        without_shop = UserFactory(email='sans-boutique@example.com')
        for user in (admin, staff, without_shop, None):
            self.api.force_authenticate(user=user)
            for action in ('change-preview', 'change', 'scheduled-change-cancel'):
                with self.subTest(user=user and user.email, action=action):
                    response = self._post(action, {'plan': 'solo', 'interval': 'year'})
                    self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.stripe.subscriptions.calls, [])
        self.assertEqual(self.stripe.invoices.previews, [])
        self.assertEqual(self.stripe.subscription_schedules.calls, [])

    def test_other_shops_are_never_touched(self) -> None:
        other_shop, _ = _shop_with_owner('Boutique B', 'owner-b@example.com')
        other = _subscribe(other_shop, 'boutique', stripe_customer_id='cus_b', stripe_subscription_id='sub_b')  # noqa: E501
        self.stripe.put_subscription(subscription_data('sub_b', 'cus_b', product='mizan_boutique', price='price_boutique_month'))  # noqa: E501
        _two_phases(self.stripe, 'sub_sched_b', 'sub_b', 'price_boutique_month', 'price_solo_month')  # noqa: E501
        self._on('boutique', 'month')
        self._preview('solo', 'month')
        self._change('solo', 'month')
        self._post('scheduled-change-cancel')
        self._confirm('commerce_plus', 'month')
        self.assertNotIn('sub_b', self.stripe.subscriptions.calls)
        self.assertNotIn('sub_sched_b', self.stripe.subscription_schedules.calls)
        self.assertNotIn('sub_sched_b', self.stripe.subscription_schedules.released)
        self.assertEqual({p['subscription'] for p in self.stripe.invoices.previews}, {'sub_a'})  # noqa: E501
        self.assertEqual({sub_id for sub_id, _ in self.stripe.subscriptions.updates}, {'sub_a'})  # noqa: E501
        other.refresh_from_db()
        self.assertEqual(other.plan.code, 'boutique')
        self.assertEqual(self.stripe.subscriptions.items['sub_b']['schedule'], 'sub_sched_b')  # noqa: E501

    def test_errors_and_logs_leak_nothing(self) -> None:
        self._on()
        leaky = f'{LEAKY_MESSAGE} {FAKE_KEY}'
        with ExitStack() as stack:
            records = _capture_records(stack, ('apps', 'django.request', 'stripe'))
            responses = [self._preview('boutique', 'month')]
            self.stripe.subscriptions.update_error = stripe.CardError(leaky, None, 'card_declined')  # noqa: E501
            responses.append(self._confirm('boutique', 'month'))
            self.stripe.invoices.error = stripe.InvalidRequestError(leaky, 'subscription', code='resource_missing')  # noqa: E501
            responses.append(self._preview('boutique', 'month'))
        self.assertEqual([r.status_code for r in responses], [200, 402, 502])
        text = '\n'.join(logging.Formatter().format(r) for r in records)
        self.assertIn('CardError', text)
        text += '\n'.join(r.content.decode() for r in responses)
        for leak in (LEAKY_MESSAGE, FAKE_KEY, 'Traceback', *STRIPE_IDS):
            self.assertNotIn(leak, text)
