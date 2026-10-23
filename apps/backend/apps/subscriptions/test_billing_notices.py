"""Messages de facturation (lot 4) : retard de paiement à J+15, rappel de fin d'essai.

Aucun appel réseau : `get_client` de `billing_notices` est remplacé par
`FakeStripeClient`. Le temps est fixé (`NOW`) ; les tâches lisent l'horloge par
`timezone.now`, remplacé le temps d'une exécution. E-mails : `mail.outbox`.
"""

from __future__ import annotations

import smtplib
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest import mock

import stripe
from django.core import mail
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.accounts.factories import UserFactory
from apps.core.models import AuditLog
from apps.products.factories import ProductFactory
from apps.shops.factories import ShopMemberFactory
from apps.shops.models import Shop
from apps.subscriptions import billing_notices, tasks
from apps.subscriptions.billing_notices import next_past_due_stage
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.stripe_fakes import (
    FAKE_KEY,
    FakeStripeClient,
    subscription_data,
)
from apps.subscriptions.stripe_sync import sync_subscription_from_stripe
from apps.subscriptions.test_stripe_billing import _shop_with_owner, _subscribe
from apps.subscriptions.test_stripe_webhooks import _capture_records

FRONTEND = 'https://app.mizan.test'
SUBSCRIPTION_URL = f'{FRONTEND}/settings/subscription'
SUPPORT = 'support@mizan-commerce.com'
NOW = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)
LOGGER = 'apps.subscriptions.billing_notices'
SEND_MAIL = 'apps.subscriptions.billing_notices.send_mail'
# Rien qui ressemble à une donnée de paiement : montant, devise, carte.
PAYMENT_WORDS = ('€', 'EUR', '4242', 'Visa', 'IBAN', 'carte bancaire')


class NextStageTests(SimpleTestCase):
    """Étape due selon l'âge du retard et la dernière étape faite."""

    def test_stage_by_elapsed_days(self) -> None:
        cases = (
            (0, 0, 1), (6, 0, 1), (6, 1, None), (7, 1, 2), (12, 2, None),
            (13, 2, 3), (14, 3, None), (15, 3, 4), (20, 3, 4), (20, 4, None),
        )
        for days, sent, expected in cases:
            with self.subTest(days=days, sent=sent):
                since = NOW - timedelta(days=days)
                self.assertEqual(next_past_due_stage(since, NOW, sent), expected)

    def test_no_stale_reminder_after_the_grace_period(self) -> None:
        for days in (15, 20):
            for sent in (0, 1, 2, 3):
                with self.subTest(days=days, sent=sent):
                    since = NOW - timedelta(days=days)
                    self.assertEqual(next_past_due_stage(since, NOW, sent), 4)

    def test_only_the_latest_due_reminder(self) -> None:
        # J+10 sans aucun envoi : le rappel de J+7, pas celui de J0 en plus.
        self.assertEqual(next_past_due_stage(NOW - timedelta(days=10), NOW, 0), 2)

    def test_nothing_without_past_due(self) -> None:
        self.assertIsNone(next_past_due_stage(None, NOW, 0))
        self.assertIsNone(next_past_due_stage(NOW + timedelta(hours=1), NOW, 0))


@override_settings(STRIPE_SECRET_KEY=FAKE_KEY, FRONTEND_URL=FRONTEND, SUPPORT_EMAIL=SUPPORT)  # noqa: E501
class NoticeTestCase(TestCase):
    """Boutique A (propriétaire et admin) en Solo, boutique B sans retard."""

    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        patcher = mock.patch('apps.subscriptions.billing_notices.get_client', return_value=self.stripe)  # noqa: E501
        patcher.start()
        self.addCleanup(patcher.stop)
        self.shop, self.owner = _shop_with_owner('Boutique A', 'owner-a@example.com')
        self.owner.full_name, self.owner.language = 'Amina', 'fr'
        self.owner.save()
        self.admin = UserFactory(email='admin-a@example.com')
        ShopMemberFactory(shop=self.shop, user=self.admin, role='admin')
        self.subscription = _subscribe(self.shop, 'solo')
        self.shop_b, self.owner_b = _shop_with_owner('Boutique B', 'owner-b@example.com')  # noqa: E501
        self.subscription_b = _subscribe(self.shop_b, 'solo')

    def _reload(self, subscription: Subscription | None = None) -> Subscription:
        subscription = subscription or self.subscription
        subscription.refresh_from_db()
        return subscription

    def _language(self, language: str) -> None:
        self.owner.language = language
        self.owner.save()


class PastDueTestCase(NoticeTestCase):
    def _past_due(
        self, days: float, sent: int = 0, subscription: Subscription | None = None,
        remote_status: str = 'past_due',
    ) -> Subscription:
        """Abonnement Stripe en retard depuis `days` jours (local et Stripe)."""
        subscription = subscription or self.subscription
        suffix = 'a' if subscription.pk == self.subscription.pk else 'b'
        Subscription.objects.filter(pk=subscription.pk).update(
            status=Subscription.STATUS_PAST_DUE,
            stripe_customer_id=f'cus_{suffix}', stripe_subscription_id=f'sub_{suffix}',
            past_due_since=NOW - timedelta(days=days), past_due_notices_sent=sent,
        )
        self.stripe.put_subscription(
            subscription_data(f'sub_{suffix}', f'cus_{suffix}', status=remote_status),
        )
        return self._reload(subscription)

    def _run(self, at: datetime = NOW) -> dict[str, Any]:
        with mock.patch('apps.subscriptions.tasks.timezone.now', return_value=at):
            return tasks.process_past_due_subscriptions()


class PastDueReminderTests(PastDueTestCase):
    def test_first_reminder_goes_to_the_owner_only_once(self) -> None:
        self._past_due(0)
        stats = self._run()
        self._run()
        self.assertEqual(stats['sent'], 1)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['owner-a@example.com'])
        self.assertEqual(message.subject, 'Le paiement de votre abonnement Mizan n’a pas abouti')  # noqa: E501
        # Date limite : J0 + 15 jours, heure de Paris (UTC+1 en novembre).
        self.assertIn('jusqu’au 7 novembre 2026 à 13:00 (Europe/Paris)', message.body)
        self.assertEqual(self._reload().past_due_notices_sent, 1)
        self.assertEqual(self.stripe.subscriptions.calls, [])

    def test_reminders_follow_the_calendar(self) -> None:
        self._past_due(0)
        expected = ((0, 1), (6, 1), (7, 2), (12, 2), (13, 3), (14, 3))
        for day, outbox_size in expected:
            with self.subTest(day=day):
                self._run(NOW + timedelta(days=day))
                self.assertEqual(len(mail.outbox), outbox_size)
        week, last = mail.outbox[1], mail.outbox[2]
        self.assertIn('Il vous reste 8 jours pour le régler', week.body)
        self.assertEqual(last.subject, 'Dernier rappel : votre abonnement Mizan sera résilié dans 2 jours')  # noqa: E501
        self.assertEqual(self._reload().past_due_notices_sent, 3)
        self.assertEqual(self.stripe.subscriptions.cancels, [])

    def test_content_has_link_support_and_no_payment_data(self) -> None:
        self._past_due(0)
        self._run()
        body = mail.outbox[0].body
        self.assertIn(SUBSCRIPTION_URL, body)
        self.assertIn('Solo', body)
        self.assertIn('Découverte', body)
        self.assertTrue(body.rstrip().endswith(f'{SUPPORT}.'))
        for word in PAYMENT_WORDS:
            self.assertNotIn(word, body)
            self.assertNotIn(word, mail.outbox[0].subject)
        self.assertNotIn('supprim', body)

    def test_english_and_arabic_fall_back_to_english(self) -> None:
        for language in ('en', 'ar'):
            with self.subTest(language=language):
                mail.outbox.clear()
                self._language(language)
                self._past_due(7, sent=1)
                self._run()
                message = mail.outbox[0]
                self.assertEqual(message.subject, 'Reminder: your Mizan subscription payment is pending')  # noqa: E501
                self.assertIn('Hello Amina,', message.body)
                self.assertIn('the Discovery plan', message.body)

    def test_a_reservation_taken_by_another_run_sends_nothing(self) -> None:
        stale = self._past_due(0)
        Subscription.objects.filter(pk=stale.pk).update(past_due_notices_sent=1)
        outcome = billing_notices.process_past_due(stale, NOW)
        self.assertEqual(outcome, billing_notices.SKIPPED)
        self.assertEqual(mail.outbox, [])

    def test_two_overlapping_runs_send_one_email(self) -> None:
        first = self._past_due(13, sent=2)
        second = Subscription.objects.get(pk=first.pk)
        outcomes = [billing_notices.process_past_due(sub, NOW) for sub in (first, second)]  # noqa: E501
        self.assertEqual(outcomes, [billing_notices.SENT, billing_notices.SKIPPED])
        self.assertEqual(len(mail.outbox), 1)

    def test_failed_send_releases_the_reservation_then_retries(self) -> None:
        self._past_due(7, sent=1)
        with ExitStack() as stack:
            records = _capture_records(stack, (LOGGER,))
            stack.enter_context(mock.patch(SEND_MAIL, side_effect=smtplib.SMTPException('owner-a@example.com refusé')))  # noqa: E501
            stats = self._run()
        self.assertEqual(stats['failed'], 1)
        self.assertEqual(self._reload().past_due_notices_sent, 1)
        logged = ' '.join(record.getMessage() for record in records)
        self.assertIn(str(self.subscription.pk), logged)
        self.assertNotIn('owner-a@example.com', logged)
        self.assertEqual(self._run()['sent'], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self._reload().past_due_notices_sent, 2)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_reminders_are_sent_without_a_stripe_key(self) -> None:
        self._past_due(0)
        self.assertEqual(self._run()['sent'], 1)

    def test_other_shop_is_not_affected(self) -> None:
        self._past_due(0)
        before = Subscription.objects.filter(pk=self.subscription_b.pk).values().get()
        self._run()
        self.assertEqual([m.to for m in mail.outbox], [['owner-a@example.com']])
        after = Subscription.objects.filter(pk=self.subscription_b.pk).values().get()
        self.assertEqual(before, after)


class PastDueResetTests(PastDueTestCase):
    def test_payment_at_day_ten_stops_everything(self) -> None:
        self._past_due(10, sent=2)
        self.stripe.subscriptions.items['sub_a']['status'] = 'active'
        sync_subscription_from_stripe(self.stripe, 'sub_a')
        subscription = self._reload()
        self.assertIsNone(subscription.past_due_since)
        self.assertEqual(subscription.past_due_notices_sent, 0)
        self.assertEqual(subscription.status, Subscription.STATUS_ACTIVE)
        for day in (0, 3, 5, 10):
            self._run(NOW + timedelta(days=day))
        self.assertEqual(mail.outbox, [])
        self.assertEqual(self.stripe.subscriptions.cancel_calls, [])
        self.assertEqual(self._reload().plan.code, 'solo')

    def test_end_of_subscription_resets_the_counter(self) -> None:
        self._past_due(3, sent=1)
        self.stripe.subscriptions.items['sub_a']['status'] = 'canceled'
        sync_subscription_from_stripe(self.stripe, 'sub_a')
        subscription = self._reload()
        self.assertIsNone(subscription.past_due_since)
        self.assertEqual(subscription.past_due_notices_sent, 0)

    def test_still_past_due_keeps_the_counter(self) -> None:
        self._past_due(3, sent=1)
        sync_subscription_from_stripe(self.stripe, 'sub_a')
        self.assertEqual(self._reload().past_due_notices_sent, 1)


class PastDueCancelTests(PastDueTestCase):
    def test_cancels_at_day_fifteen(self) -> None:
        since = self._past_due(15, sent=3).past_due_since
        stats = self._run()
        self.assertEqual(stats['cancelled'], 1)
        key = f'mizan-pastdue-cancel-{self.subscription.pk}-{int(since.timestamp())}'
        self.assertEqual(self.stripe.subscriptions.cancel_calls, [
            ('sub_a', {'invoice_now': False, 'prorate': False}, {'idempotency_key': key}),  # noqa: E501
        ])
        # Relu avant de résilier, puis après.
        self.assertEqual(self.stripe.subscriptions.calls, ['sub_a', 'sub_a'])
        subscription = self._reload()
        self.assertEqual(subscription.plan.code, SubscriptionPlan.CODE_FREE)
        self.assertEqual(subscription.stripe_subscription_id, '')
        self.assertIsNone(subscription.past_due_since)
        self.assertEqual(subscription.past_due_notices_sent, 0)
        ended = AuditLog.objects.get(action='subscription_ended')
        self.assertEqual(ended.changes, {'from': 'solo', 'to': 'free'})

    def test_end_email_is_sent_once(self) -> None:
        self._past_due(15, sent=3)
        self._run()
        self._run(NOW + timedelta(minutes=15))
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['owner-a@example.com'])
        self.assertEqual(message.subject, 'Votre abonnement Mizan est résilié')
        self.assertIn('abonnement Solo', message.body)
        self.assertIn('délai de 15 jours', message.body)
        self.assertIn('Toutes vos données sont conservées', message.body)
        self.assertIn(SUBSCRIPTION_URL, message.body)
        self.assertNotIn('supprim', message.body)
        self.assertEqual(len(self.stripe.subscriptions.cancel_calls), 1)

    def test_late_run_cancels_without_stale_reminders(self) -> None:
        self._past_due(20, sent=1)
        self._run()
        self.assertEqual(len(self.stripe.subscriptions.cancel_calls), 1)
        self.assertEqual([m.subject for m in mail.outbox], ['Votre abonnement Mizan est résilié'])  # noqa: E501

    def test_no_cancel_when_stripe_says_it_was_paid(self) -> None:
        self._past_due(15, sent=3, remote_status='active')
        stats = self._run()
        self.assertEqual(stats['cancelled'], 0)
        self.assertEqual(self.stripe.subscriptions.cancel_calls, [])
        self.assertEqual(mail.outbox, [])
        subscription = self._reload()
        self.assertEqual(subscription.status, Subscription.STATUS_ACTIVE)
        self.assertEqual(subscription.plan.code, 'solo')
        self.assertEqual(subscription.past_due_notices_sent, 0)

    def test_stripe_failure_releases_then_retries(self) -> None:
        self._past_due(15, sent=3)
        self.stripe.subscriptions.cancel_error = stripe.APIConnectionError('injoignable')  # noqa: E501
        self.assertEqual(self._run()['failed'], 1)
        self.assertEqual(self._reload().past_due_notices_sent, 3)
        self.assertEqual(mail.outbox, [])
        self.stripe.subscriptions.cancel_error = None
        self.assertEqual(self._run()['cancelled'], 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_two_overlapping_runs_cancel_once(self) -> None:
        first = self._past_due(15, sent=3)
        second = Subscription.objects.get(pk=first.pk)
        outcomes = [billing_notices.process_past_due(sub, NOW) for sub in (first, second)]  # noqa: E501
        self.assertEqual(outcomes, [billing_notices.CANCELLED, billing_notices.SKIPPED])
        self.assertEqual(len(self.stripe.subscriptions.cancel_calls), 1)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_without_stripe_key_nothing_is_cancelled(self) -> None:
        self._past_due(15, sent=3)
        stats = self._run()
        self.assertEqual((stats['cancelled'], stats['failed']), (0, 0))
        self.assertEqual(self.stripe.subscriptions.cancel_calls, [])
        self.assertEqual(self._reload().past_due_notices_sent, 3)

    def test_an_error_on_one_shop_does_not_stop_the_others(self) -> None:
        self._past_due(15, sent=3)
        self._past_due(15, sent=3, subscription=self.subscription_b)
        self.stripe.subscriptions.failing.add('sub_a')
        stats = self._run()
        self.assertEqual((stats['cancelled'], stats['failed']), (1, 1))
        self.assertEqual(self.stripe.subscriptions.cancels, ['sub_b'])
        self.assertEqual(self._reload().past_due_notices_sent, 3)
        self.assertEqual([m.to for m in mail.outbox], [['owner-b@example.com']])

    def test_an_unexpected_error_does_not_stop_the_others(self) -> None:
        self._past_due(0)
        self._past_due(0, subscription=self.subscription_b)
        outcomes = [RuntimeError('imprévu'), billing_notices.SENT]
        with mock.patch.object(billing_notices, 'process_past_due', side_effect=outcomes):  # noqa: E501
            stats = self._run()
        self.assertEqual((stats['sent'], stats['failed']), (1, 1))


class TrialEndingTestCase(NoticeTestCase):
    def setUp(self) -> None:
        super().setUp()
        Subscription.objects.filter(pk=self.subscription.pk).update(
            plan=SubscriptionPlan.objects.get(code='boutique'),
            status=Subscription.STATUS_TRIALING,
            current_period_end=NOW + timedelta(hours=20),
        )
        self._reload()

    def _run(self, at: datetime = NOW) -> dict[str, Any]:
        with mock.patch('apps.subscriptions.tasks.timezone.now', return_value=at):
            return tasks.send_trial_ending_notices()

    def _ends_in(self, delta: timedelta, **fields: Any) -> None:
        Subscription.objects.filter(pk=self.subscription.pk).update(
            current_period_end=NOW + delta, **fields,
        )


class TrialEndingTests(TrialEndingTestCase):
    def test_sent_once_inside_the_last_24_hours(self) -> None:
        self.assertEqual(self._run()['sent'], 1)
        self._run(NOW + timedelta(minutes=15))
        self._run(NOW + timedelta(hours=19))
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['owner-a@example.com'])
        self.assertEqual(message.subject, 'Votre essai gratuit Mizan se termine dans moins de 24 heures')  # noqa: E501
        self.assertEqual(self._reload().trial_ending_notice_sent_at, NOW)

    def test_never_too_early_after_the_end_or_with_stripe(self) -> None:
        cases = (
            (timedelta(hours=25), {}),
            (timedelta(hours=-1), {}),
            (timedelta(hours=20), {'stripe_subscription_id': 'sub_a'}),
            (timedelta(hours=20), {'status': Subscription.STATUS_ACTIVE}),
        )
        for delta, fields in cases:
            with self.subTest(delta=delta, fields=fields):
                self._ends_in(delta, **fields)
                self._run()
                self.assertEqual(mail.outbox, [])
        self.assertIsNone(self._reload().trial_ending_notice_sent_at)

    def test_two_overlapping_runs_send_one_email(self) -> None:
        first = self._reload()
        second = Subscription.objects.get(pk=first.pk)
        outcomes = [billing_notices.send_trial_ending_notice(s, NOW) for s in (first, second)]  # noqa: E501
        self.assertEqual(outcomes, [billing_notices.SENT, billing_notices.SKIPPED])
        self.assertEqual(len(mail.outbox), 1)

    def test_failed_send_is_retried(self) -> None:
        with ExitStack() as stack:
            records = _capture_records(stack, (LOGGER,))
            stack.enter_context(mock.patch(SEND_MAIL, side_effect=OSError('smtp down')))
            self.assertEqual(self._run()['failed'], 1)
        self.assertIsNone(self._reload().trial_ending_notice_sent_at)
        self.assertIn(str(self.subscription.pk), records[-1].getMessage())
        self.assertEqual(self._run(NOW + timedelta(minutes=15))['sent'], 1)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_sent_without_a_stripe_key(self) -> None:
        self.assertEqual(self._run()['sent'], 1)

    def test_other_shop_in_trial_far_from_its_end_is_untouched(self) -> None:
        Subscription.objects.filter(pk=self.subscription_b.pk).update(
            status=Subscription.STATUS_TRIALING, current_period_end=NOW + timedelta(days=5),  # noqa: E501
        )
        self._run()
        self.assertEqual([m.to for m in mail.outbox], [['owner-a@example.com']])
        self.assertIsNone(self._reload(self.subscription_b).trial_ending_notice_sent_at)


class TrialEndingContentTests(TrialEndingTestCase):
    def setUp(self) -> None:
        super().setUp()
        # Limites lues en base : une valeur inhabituelle prouve qu'elles ne sont
        # pas recopiées dans le texte.
        self.free = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
        self.free.max_products = 5
        self.free.save()
        for _ in range(7):
            ProductFactory(shop=self.shop, is_active=True)
        ProductFactory(shop=self.shop, is_active=False)

    def test_french_body(self) -> None:
        Shop.objects.filter(pk=self.shop.pk).update(catalog_kind=Shop.CATALOG_PRODUCTS)
        self._run()
        body = mail.outbox[0].body
        self.assertIn('Bonjour Amina,', body)
        # Fin le 24 à 8:00 UTC, 10:00 à Paris (heure d'été jusqu'au 25 octobre).
        self.assertIn('se termine le 24 octobre 2026 à 10:00 (Europe/Paris)', body)
        self.assertIn('- 5 articles actifs', body)
        self.assertIn(f'- {self.free.max_orders_per_month} ventes par mois', body)
        self.assertIn(f'- {self.free.max_customers} clients actifs', body)
        self.assertIn(
            'Vous avez 7 articles actifs, la limite est 5 : vous ne pourrez plus en créer.',  # noqa: E501
            body,
        )
        self.assertIn(
            f'Votre boutique compte 2 membres, la limite est {self.free.max_members}',
            body,
        )
        self.assertNotIn('clients actifs, la limite', body)
        self.assertIn('Toutes vos données sont conservées', body)
        self.assertNotIn('supprim', body)
        self.assertIn(SUBSCRIPTION_URL, body)
        self.assertTrue(body.rstrip().endswith(f'{SUPPORT}.'))
        for word in PAYMENT_WORDS:
            self.assertNotIn(word, body)

    def test_english_body_in_the_shop_timezone(self) -> None:
        Shop.objects.filter(pk=self.shop.pk).update(
            timezone='America/New_York', catalog_kind=Shop.CATALOG_SERVICES,
        )
        self._language('en')
        self._run()
        body = mail.outbox[0].body
        self.assertIn('Your free trial ends on October 24, 2026 at 4:00', body)
        self.assertIn('(America/New_York)', body)
        self.assertIn('You have 7 active services, the limit is 5', body)
        self.assertNotIn('delet', body)

    def test_default_catalog_counts_items_and_services(self) -> None:
        self._run()
        self.assertIn('Vous avez 7 articles et services actifs, la limite est 5', mail.outbox[0].body)  # noqa: E501

    def test_arabic_falls_back_to_english(self) -> None:
        self._language('ar')
        self._run()
        self.assertEqual(mail.outbox[0].subject, 'Your Mizan free trial ends in less than 24 hours')  # noqa: E501

    def test_nothing_reached_means_no_usage_section(self) -> None:
        self.free.max_products = 50
        self.free.max_members = 5
        self.free.save()
        self._run()
        self.assertNotIn('atteint déjà', mail.outbox[0].body)


class CurrentSubscriptionTests(NoticeTestCase):
    def _current(self) -> dict[str, Any]:
        api = APIClient()
        api.force_authenticate(user=self.owner)
        response = api.get(reverse('subscription-current'))
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_trial_ends_at(self) -> None:
        end = NOW + timedelta(days=3)
        Subscription.objects.filter(pk=self.subscription.pk).update(
            status=Subscription.STATUS_TRIALING, current_period_end=end,
        )
        data = self._current()
        self.assertEqual(parse_datetime(data['trial_ends_at']), end)
        self.assertNotIn('past_due_notices_sent', data)

    def test_no_trial_ends_at_outside_a_trial(self) -> None:
        Subscription.objects.filter(pk=self.subscription.pk).update(
            current_period_end=NOW + timedelta(days=3), past_due_notices_sent=2,
        )
        data = self._current()
        self.assertIsNone(data['trial_ends_at'])
        self.assertNotIn('past_due_notices_sent', data)
