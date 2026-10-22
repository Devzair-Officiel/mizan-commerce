"""Synchronisation d'un abonnement local depuis Stripe (lot 2) et réconciliation.

Aucun appel réseau : `FakeStripeClient` (stripe_fakes.py) renvoie des objets
construits par le SDK à partir de dictionnaires.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.core.models import AuditLog
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.stripe_fakes import (
    FAKE_KEY,
    FakeStripeClient,
    subscription_data,
)
from apps.subscriptions.stripe_sync import sync_subscription_from_stripe
from apps.subscriptions.tasks import reconcile_subscriptions

SYNC_LOGGER = 'apps.subscriptions.stripe_sync'
STATE_FIELDS = (
    'plan_id', 'status', 'stripe_subscription_id', 'stripe_customer_id',
    'current_period_start', 'current_period_end', 'cancel_at_period_end',
    'cancelled_at', 'past_due_since', 'updated_at',
)


def _local(customer: str, sub_id: str = '', plan_code: str = 'solo', **fields: Any) -> Subscription:  # noqa: E501
    plan = SubscriptionPlan.objects.get(code=plan_code)
    return SubscriptionFactory(
        plan=plan, stripe_customer_id=customer, stripe_subscription_id=sub_id, **fields,
    )


def _state(subscription: Subscription) -> dict[str, Any]:
    subscription.refresh_from_db()
    return {field: getattr(subscription, field) for field in STATE_FIELDS}


def _actions(subscription: Subscription) -> list[str]:
    return sorted(
        AuditLog.objects.filter(object_id=str(subscription.pk))
        .values_list('action', flat=True),
    )


def _at(timestamp: int) -> datetime:
    return datetime.fromtimestamp(timestamp, tz=UTC)


class StripeSyncTests(TestCase):
    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        self.local = _local('cus_a', 'sub_a')

    def _sync(self, sub_id: str = 'sub_a', customer: str = 'cus_a', **data: Any) -> None:  # noqa: E501
        self.stripe.put_subscription(subscription_data(sub_id, customer, **data))
        sync_subscription_from_stripe(self.stripe, sub_id)
        self.local.refresh_from_db()

    def test_live_statuses_are_mapped(self) -> None:
        cases = (
            ('active', Subscription.STATUS_ACTIVE),
            ('trialing', Subscription.STATUS_ACTIVE),
            ('past_due', Subscription.STATUS_PAST_DUE),
            ('unpaid', Subscription.STATUS_PAST_DUE),
        )
        for remote, expected in cases:
            with self.subTest(remote=remote):
                Subscription.objects.filter(pk=self.local.pk).update(
                    status=Subscription.STATUS_ACTIVE, past_due_since=None,
                )
                self._sync(status=remote)
                self.assertEqual(self.local.status, expected)

    def test_unsupported_statuses_change_nothing(self) -> None:
        for remote in ('incomplete', 'incomplete_expired', 'paused', 'statut_futur'):
            with self.subTest(remote=remote):
                before = _state(self.local)
                with self.assertLogs(SYNC_LOGGER, 'WARNING'):
                    self._sync(status=remote, product='mizan_boutique')
                self.assertEqual(_state(self.local), before)
        self.assertEqual(_actions(self.local), [])

    def test_canceled_returns_to_free_and_keeps_customer(self) -> None:
        Subscription.objects.filter(pk=self.local.pk).update(
            status=Subscription.STATUS_PAST_DUE, past_due_since=timezone.now(),
            cancel_at_period_end=True,
        )
        self._sync(status='canceled')
        self.assertEqual(self.local.plan.code, SubscriptionPlan.CODE_FREE)
        self.assertEqual(self.local.status, Subscription.STATUS_ACTIVE)
        self.assertEqual(self.local.stripe_subscription_id, '')
        self.assertEqual(self.local.stripe_customer_id, 'cus_a')
        self.assertIsNotNone(self.local.cancelled_at)
        self.assertIsNone(self.local.past_due_since)
        self.assertIsNone(self.local.current_period_end)
        self.assertFalse(self.local.cancel_at_period_end)
        ended = AuditLog.objects.get(action='subscription_ended')
        self.assertEqual(ended.changes, {'from': 'solo', 'to': 'free'})

    def test_late_end_of_an_old_subscription_is_ignored(self) -> None:
        Subscription.objects.filter(pk=self.local.pk).update(stripe_subscription_id='sub_new')  # noqa: E501
        before = _state(self.local)
        self._sync(sub_id='sub_old', status='canceled')
        self.assertEqual(_state(self.local), before)
        self.assertEqual(_actions(self.local), [])

    def test_period_is_read_from_items(self) -> None:
        self._sync(periods=((1_790_000_100, 1_790_000_400), (1_790_000_050, 1_790_000_300)))  # noqa: E501
        self.assertEqual(self.local.current_period_start, _at(1_790_000_050))
        self.assertEqual(self.local.current_period_end, _at(1_790_000_400))

    def test_period_falls_back_to_subscription_attributes(self) -> None:
        self._sync(
            periods=(), current_period_start=1_790_000_000,
            current_period_end=1_792_592_000,
        )
        self.assertEqual(self.local.current_period_start, _at(1_790_000_000))
        self.assertEqual(self.local.current_period_end, _at(1_792_592_000))

    def test_plan_comes_from_product_even_with_unknown_price(self) -> None:
        self._sync(product='mizan_boutique', price='price_jamais_vu')
        self.assertEqual(self.local.plan.code, SubscriptionPlan.CODE_BOUTIQUE)
        changed = AuditLog.objects.get(action='subscription_plan_changed')
        self.assertEqual(changed.changes, {'from': 'solo', 'to': 'boutique'})

    def test_unknown_product_keeps_plan(self) -> None:
        with self.assertLogs(SYNC_LOGGER, 'WARNING'):
            self._sync(product='prod_etranger', status='past_due')
        self.assertEqual(self.local.plan.code, SubscriptionPlan.CODE_SOLO)
        self.assertEqual(self.local.status, Subscription.STATUS_PAST_DUE)

    def test_past_due_since_is_set_once_then_cleared(self) -> None:
        self._sync(status='past_due')
        self.assertIsNotNone(self.local.past_due_since)
        first = timezone.now() - timedelta(days=3)
        Subscription.objects.filter(pk=self.local.pk).update(past_due_since=first)
        self._sync(status='unpaid', cancel_at_period_end=True)
        self.assertEqual(self.local.past_due_since, first)
        self._sync(status='active')
        self.assertIsNone(self.local.past_due_since)
        self.assertEqual(_actions(self.local).count('subscription_payment_failed'), 1)

    def test_cancel_at_counts_as_scheduled_cancellation(self) -> None:
        self._sync(cancel_at=1_792_592_000)
        self.assertTrue(self.local.cancel_at_period_end)
        self._sync()
        self.assertFalse(self.local.cancel_at_period_end)
        self.assertEqual(
            _actions(self.local),
            ['subscription_cancel_reverted', 'subscription_cancel_scheduled'],
        )

    def test_new_subscription_is_audited_as_started(self) -> None:
        Subscription.objects.filter(pk=self.local.pk).update(
            plan=SubscriptionPlan.objects.get(code='free'), stripe_subscription_id='',
        )
        self._sync(product='mizan_boutique')
        self.assertEqual(self.local.stripe_subscription_id, 'sub_a')
        self.assertEqual(_actions(self.local), ['subscription_started'])
        self.assertEqual(AuditLog.objects.get().changes, {'plan': 'boutique'})

    def test_nothing_written_nor_audited_without_change(self) -> None:
        self._sync(status='past_due', product='mizan_boutique')
        before, actions = _state(self.local), _actions(self.local)
        self._sync(status='past_due', product='mizan_boutique')
        self.assertEqual(_state(self.local), before)
        self.assertEqual(_actions(self.local), actions)

    def test_unknown_customer_changes_nothing(self) -> None:
        before = _state(self.local)
        with self.assertLogs(SYNC_LOGGER, 'WARNING'):
            self._sync(sub_id='sub_x', customer='cus_inconnu', status='past_due')
        self.assertEqual(_state(self.local), before)
        self.assertFalse(AuditLog.objects.exists())

    def test_other_shops_are_untouched(self) -> None:
        other = _local('cus_b', 'sub_b', plan_code='boutique')
        before = _state(other)
        self._sync(status='canceled')
        self.assertEqual(_state(other), before)
        self.assertEqual(_actions(other), [])


@override_settings(STRIPE_SECRET_KEY=FAKE_KEY)
class ReconcileSubscriptionsTests(TestCase):
    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        patcher = mock.patch('apps.subscriptions.tasks.get_client', return_value=self.stripe)  # noqa: E501
        self.get_client = patcher.start()
        self.addCleanup(patcher.stop)
        self.locals = [_local(f'cus_{n}', f'sub_{n}') for n in (1, 2, 3)]
        self.without_stripe = _local('cus_4')
        for n in (1, 2, 3):
            self.stripe.put_subscription(subscription_data(f'sub_{n}', f'cus_{n}', status='past_due'))  # noqa: E501

    def test_stripe_error_does_not_stop_the_others(self) -> None:
        self.stripe.subscriptions.failing.add('sub_2')
        with self.assertLogs('apps.subscriptions.tasks', 'WARNING') as logs:
            stats = reconcile_subscriptions()
        self.assertEqual((stats['synced'], stats['errors']), (2, 1))
        statuses = [Subscription.objects.get(pk=s.pk).status for s in self.locals]
        self.assertEqual(statuses, ['past_due', 'active', 'past_due'])
        self.assertCountEqual(self.stripe.subscriptions.calls, ['sub_1', 'sub_2', 'sub_3'])  # noqa: E501
        output = '\n'.join(logs.output)
        self.assertIn(str(self.locals[1].pk), output)
        self.assertNotIn('sub_2', output)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_does_nothing_without_key(self) -> None:
        stats = reconcile_subscriptions()
        self.assertEqual((stats['synced'], stats['errors']), (0, 0))
        self.get_client.assert_not_called()
        self.assertEqual(self.stripe.subscriptions.calls, [])
