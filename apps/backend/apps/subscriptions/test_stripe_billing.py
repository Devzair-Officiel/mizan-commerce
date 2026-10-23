"""Facturation du propriétaire (lot 3a) : paiement, portail, résiliation, reprise.

Aucun appel réseau : `get_client` de `stripe_billing` est remplacé par
`FakeStripeClient`, qui enregistre les paramètres envoyés à Stripe.
"""

from __future__ import annotations

import logging
from contextlib import ExitStack
from datetime import timedelta
from typing import Any
from unittest import mock

import stripe
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.accounts.factories import UserFactory
from apps.accounts.models import User
from apps.shops.factories import ShopFactory, ShopMemberFactory
from apps.shops.models import Shop
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.stripe_billing import ensure_stripe_customer
from apps.subscriptions.stripe_fakes import (
    FAKE_KEY,
    FakeStripeClient,
    subscription_data,
)
from apps.subscriptions.test_stripe_webhooks import _capture_records

FRONTEND = 'https://app.mizan.test'
LEAKY_MESSAGE = 'détail-interne-stripe-à-ne-pas-montrer'
ACTIONS = ('checkout', 'portal', 'cancel', 'resume', 'refresh')


@override_settings(STRIPE_SECRET_KEY=FAKE_KEY, FRONTEND_URL=FRONTEND)
class BillingTestCase(TestCase):
    """Boutique dont l'utilisateur est propriétaire, Solo prête au paiement."""

    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        patcher = mock.patch('apps.subscriptions.stripe_billing.get_client', return_value=self.stripe)  # noqa: E501
        patcher.start()
        self.addCleanup(patcher.stop)
        SubscriptionPlan.objects.filter(code=SubscriptionPlan.CODE_SOLO).update(
            stripe_price_id='price_solo_month', stripe_price_id_yearly='price_solo_year',  # noqa: E501
        )
        self.shop, self.owner = _shop_with_owner('Boutique A', 'owner-a@example.com')
        self.subscription = _subscribe(self.shop, 'free')
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

    def _post(self, action: str, data: dict[str, Any] | None = None) -> Any:
        return self.api.post(reverse(f'subscription-{action}'), data or {}, format='json')  # noqa: E501

    def _live(self, status: str = 'active', **remote: Any) -> None:
        """Abonnement Stripe en cours, localement et chez Stripe."""
        Subscription.objects.filter(pk=self.subscription.pk).update(
            plan=SubscriptionPlan.objects.get(code='solo'), status=status,
            stripe_customer_id='cus_a', stripe_subscription_id='sub_a',
        )
        self.stripe.put_subscription(subscription_data('sub_a', 'cus_a', status=status, **remote))  # noqa: E501

    def _reload(self) -> Subscription:
        self.subscription.refresh_from_db()
        return self.subscription


def _shop_with_owner(name: str, email: str) -> tuple[Shop, User]:
    shop = ShopFactory(name=name)
    owner = UserFactory(email=email)
    ShopMemberFactory(shop=shop, user=owner, role='owner')
    return shop, owner


def _subscribe(shop: Shop, plan_code: str, **fields: Any) -> Subscription:
    plan = SubscriptionPlan.objects.get(code=plan_code)
    return SubscriptionFactory(shop=shop, plan=plan, **fields)


class PermissionTests(BillingTestCase):
    def test_only_the_owner_can_act(self) -> None:
        admin, staff = UserFactory(email='admin@example.com'), UserFactory(email='staff@example.com')  # noqa: E501
        ShopMemberFactory(shop=self.shop, user=admin, role='admin')
        ShopMemberFactory(shop=self.shop, user=staff, role='staff')
        without_shop = UserFactory(email='sans-boutique@example.com')
        for user in (admin, staff, without_shop, None):
            self.api.force_authenticate(user=user)
            for action in (*ACTIONS, 'change'):
                with self.subTest(user=user and user.email, action=action):
                    response = self._post(action, {'plan': 'solo', 'interval': 'month'})
                    self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.stripe.customers.calls, [])
        self.assertEqual(self.stripe.checkout.sessions.calls, [])

    def test_every_member_reads_current_but_only_the_owner_can_manage(self) -> None:
        staff = UserFactory(email='staff@example.com')
        ShopMemberFactory(shop=self.shop, user=staff, role='staff')
        for user, can_manage in ((self.owner, True), (staff, False)):
            self.api.force_authenticate(user=user)
            response = self.api.get(reverse('subscription-current'))
            self.assertEqual(response.status_code, 200)
            self.assertIs(response.data['can_manage'], can_manage)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_billing_disabled_is_a_generic_503(self) -> None:
        self._live()
        for action in ACTIONS:
            with self.subTest(action=action):
                response = self._post(action, {'plan': 'solo', 'interval': 'month'})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.data['code'], 'billing_disabled')
        self.assertEqual(self._post('change', {'plan_code': 'free'}).status_code, 503)
        self.assertEqual(self._reload().plan.code, 'solo')


class CheckoutTests(BillingTestCase):
    def _checkout(self, plan: str = 'solo', interval: str = 'month') -> Any:
        return self._post('checkout', {'plan': plan, 'interval': interval})

    def test_returns_the_session_url(self) -> None:
        response = self._checkout()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'url': 'https://stripe.test/cs_1'})

    def test_session_parameters(self) -> None:
        self._checkout(interval='year')
        params = self.stripe.checkout.sessions.last_params
        shop_id = str(self.shop.id)
        self.assertNotIn('payment_method_types', params)
        self.assertNotIn('trial_end', params['subscription_data'])
        self.assertEqual(params['mode'], 'subscription')
        self.assertEqual(params['customer'], 'cus_1')
        self.assertEqual(params['line_items'], [{'price': 'price_solo_year', 'quantity': 1}])  # noqa: E501
        self.assertEqual(params['success_url'], f'{FRONTEND}/settings/subscription?checkout=success')  # noqa: E501
        self.assertEqual(params['cancel_url'], f'{FRONTEND}/settings/subscription?checkout=cancelled')  # noqa: E501
        self.assertEqual(params['client_reference_id'], shop_id)
        self.assertEqual(params['subscription_data'], {'metadata': {'shop_id': shop_id}})  # noqa: E501
        self.assertEqual(params['consent_collection'], {'terms_of_service': 'required'})
        self.assertEqual(params['billing_address_collection'], 'required')
        self.assertEqual(params['locale'], 'auto')
        terms = params['custom_text']['terms_of_service_acceptance']['message']
        self.assertIn(f'({FRONTEND}/cgv)', terms)

    @override_settings(ALLOWED_HOSTS=['pirate.example'])
    def test_urls_never_come_from_the_request(self) -> None:
        response = self.api.post(
            reverse('subscription-checkout'), {'plan': 'solo', 'interval': 'month'},
            format='json', HTTP_HOST='pirate.example',
            HTTP_ORIGIN='https://pirate.example', HTTP_REFERER='https://pirate.example/',
        )
        self.assertEqual(response.status_code, 200)
        params = self.stripe.checkout.sessions.last_params
        for key in ('success_url', 'cancel_url'):
            self.assertTrue(params[key].startswith(f'{FRONTEND}/'))

    def test_texts_follow_the_owner_language_and_trial(self) -> None:
        cases = (('fr', "J'accepte les [CGV]"), ('en', 'I accept the'), ('ar', 'I accept the'))  # noqa: E501
        for language, start in cases:
            with self.subTest(language=language):
                User.objects.filter(pk=self.owner.pk).update(language=language)
                self.owner.refresh_from_db()
                self.api.force_authenticate(user=self.owner)
                self._checkout()
                text = self.stripe.checkout.sessions.last_params['custom_text']
                self.assertTrue(text['terms_of_service_acceptance']['message'].startswith(start))  # noqa: E501
                self.assertNotIn('essai', text['submit']['message'])
        Subscription.objects.filter(pk=self.subscription.pk).update(
            status=Subscription.STATUS_TRIALING, current_period_end=timezone.now() + timedelta(days=3),  # noqa: E501
        )
        self._checkout()
        submit = self.stripe.checkout.sessions.last_params['custom_text']['submit']['message']  # noqa: E501
        self.assertTrue(submit.endswith('Your free trial ends as soon as you pay.'))

    def test_customer_is_created_once(self) -> None:
        self._checkout()
        self._checkout(interval='year')
        self.assertEqual(len(self.stripe.customers.calls), 1)
        params, options = self.stripe.customers.calls[0]
        self.assertEqual(params, {
            'email': self.owner.email, 'name': 'Boutique A',
            'metadata': {'shop_id': str(self.shop.id)},
        })
        self.assertEqual(options, {'idempotency_key': f'mizan-customer-{self.shop.id}'})
        self.assertEqual(self._reload().stripe_customer_id, 'cus_1')

    def test_concurrent_customer_creation_keeps_the_first(self) -> None:
        # Une autre requête a posé son client entre la lecture et l'écriture.
        stale = Subscription.objects.select_related('shop').get(pk=self.subscription.pk)
        Subscription.objects.filter(pk=stale.pk).update(stripe_customer_id='cus_gagnant')
        with self.assertLogs('apps.subscriptions.stripe_billing', 'WARNING'):
            customer = ensure_stripe_customer(self.stripe, stale, self.owner)
        self.assertEqual(customer, 'cus_gagnant')
        self.assertEqual(self._reload().stripe_customer_id, 'cus_gagnant')

    def test_already_subscribed_is_a_409(self) -> None:
        for status in ('active', 'past_due'):
            with self.subTest(status=status):
                self._live(status=status)
                response = self._checkout()
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.data['code'], 'already_subscribed')
        self.assertEqual(self.stripe.checkout.sessions.calls, [])

    def test_free_unknown_or_bad_interval_is_rejected(self) -> None:
        for plan, interval in (('free', 'month'), ('enterprise', 'month'), ('solo', 'lifetime'), ('', '')):  # noqa: E501
            with self.subTest(plan=plan, interval=interval):
                self.assertEqual(self._checkout(plan, interval).status_code, 400)
        self.assertEqual(self.stripe.customers.calls, [])

    def test_inactive_plan_is_rejected(self) -> None:
        SubscriptionPlan.objects.filter(code='solo').update(is_active=False)
        response = self._checkout()
        self.assertEqual((response.status_code, response.data['code']), (400, 'invalid_plan'))  # noqa: E501

    def test_missing_price_is_reported(self) -> None:
        with self.assertLogs('apps.subscriptions.stripe_billing', 'ERROR') as logs:
            response = self._checkout('boutique')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'catalog_not_synced')
        self.assertIn('stripe_sync_plans', '\n'.join(logs.output))
        self.assertEqual(self.stripe.customers.calls, [])


class PortalTests(BillingTestCase):
    def test_returns_the_portal_url(self) -> None:
        Subscription.objects.filter(pk=self.subscription.pk).update(stripe_customer_id='cus_a')  # noqa: E501
        response = self._post('portal')
        self.assertEqual(response.json(), {'url': 'https://stripe.test/bps_1'})
        self.assertEqual(self.stripe.billing_portal.sessions.last_params, {
            'customer': 'cus_a', 'return_url': f'{FRONTEND}/settings/subscription',
        })

    def test_requires_a_billing_customer(self) -> None:
        response = self._post('portal')
        self.assertEqual((response.status_code, response.data['code']), (409, 'no_billing_customer'))  # noqa: E501

    def test_is_throttled(self) -> None:
        statuses = [self._post('portal').status_code for _ in range(11)]
        self.assertEqual(statuses, [409] * 10 + [429])


class CancelResumeTests(BillingTestCase):
    def test_active_is_cancelled_at_period_end_once(self) -> None:
        self._live()
        for _ in range(2):
            response = self._post('cancel')
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data['cancel_at_period_end'])
        self.assertEqual(self.stripe.subscriptions.updates, [('sub_a', {'cancel_at_period_end': True})])  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.cancels, [])
        self.assertEqual(self._reload().plan.code, 'solo')

    def test_past_due_is_cancelled_now(self) -> None:
        self._live(status='past_due')
        response = self._post('cancel')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stripe.subscriptions.cancels, ['sub_a'])
        self.assertEqual(response.data['plan']['code'], 'free')
        self.assertFalse(response.data['stripe_managed'])
        self.assertEqual(self._post('cancel').data['code'], 'nothing_to_cancel')

    def test_nothing_to_cancel_is_a_409(self) -> None:
        response = self._post('cancel')
        self.assertEqual((response.status_code, response.data['code']), (409, 'nothing_to_cancel'))  # noqa: E501

    def test_resume_clears_the_scheduled_end(self) -> None:
        for remote, expected in (
            ({'cancel_at_period_end': True}, {'cancel_at_period_end': False}),
            ({'cancel_at': 1_792_592_000}, {'cancel_at': ''}),
        ):
            with self.subTest(remote=remote):
                self._live(**remote)
                Subscription.objects.filter(pk=self.subscription.pk).update(cancel_at_period_end=True)  # noqa: E501
                response = self._post('resume')
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.data['cancel_at_period_end'])
                self.assertEqual(self.stripe.subscriptions.updates[-1], ('sub_a', expected))  # noqa: E501

    def test_resume_without_schedule_is_refused(self) -> None:
        self._live()
        Subscription.objects.filter(pk=self.subscription.pk).update(cancel_at_period_end=True)  # noqa: E501
        response = self._post('resume')
        self.assertEqual((response.status_code, response.data['code']), (409, 'nothing_to_resume'))  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.updates, [])
        # L'état local périmé est corrigé au passage.
        self.assertFalse(self._reload().cancel_at_period_end)

    def test_resume_of_an_ended_subscription_is_refused(self) -> None:
        self._live(cancel_at_period_end=True)
        self.stripe.subscriptions.items['sub_a']['status'] = 'canceled'
        response = self._post('resume')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self._reload().plan.code, 'free')
        self.assertEqual(self._post('resume').data['code'], 'nothing_to_resume')


class RefreshTests(BillingTestCase):
    def test_syncs_the_live_subscription_first(self) -> None:
        Subscription.objects.filter(pk=self.subscription.pk).update(stripe_customer_id='cus_a')  # noqa: E501
        for sub_id, status, created in (('sub_old', 'canceled', 1), ('sub_new', 'active', 2), ('sub_x', 'incomplete', 3)):  # noqa: E501
            self.stripe.put_subscription(subscription_data(
                sub_id, 'cus_a', status=status, created=created, interval='year',
            ))
        self.stripe.put_subscription(subscription_data('sub_other', 'cus_b', created=9))
        response = self._post('refresh')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stripe.subscriptions.listed, [{'customer': 'cus_a', 'status': 'all', 'limit': 10}])  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.calls, ['sub_new'])
        self.assertEqual(response.data['plan']['code'], 'solo')
        self.assertTrue(response.data['stripe_managed'])
        self.assertEqual(response.data['billing_interval'], 'year')

    def test_without_customer_or_subscription_returns_local_state(self) -> None:
        self.assertEqual(self._post('refresh').data['plan']['code'], 'free')
        Subscription.objects.filter(pk=self.subscription.pk).update(stripe_customer_id='cus_a')  # noqa: E501
        self.assertEqual(self._post('refresh').status_code, 200)
        self.assertEqual(self.stripe.subscriptions.calls, [])


class ChangeTests(BillingTestCase):
    def test_trial_or_free_without_stripe_switches_locally(self) -> None:
        Subscription.objects.filter(pk=self.subscription.pk).update(
            plan=SubscriptionPlan.objects.get(code='boutique'), status=Subscription.STATUS_TRIALING,  # noqa: E501
            current_period_end=timezone.now() + timedelta(days=5),
        )
        response = self._post('change', {'plan_code': 'free'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['plan']['code'], 'free')
        self.assertEqual(self.stripe.subscriptions.calls, [])

    def test_live_stripe_subscription_is_cancelled_at_stripe(self) -> None:
        self._live()
        response = self._post('change', {'plan_code': 'free'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['cancel_at_period_end'])
        self.assertEqual(response.data['plan']['code'], 'solo')
        self.assertEqual(self.stripe.subscriptions.updates, [('sub_a', {'cancel_at_period_end': True})])  # noqa: E501

    def test_paid_target_is_refused(self) -> None:
        self._live()
        response = self._post('change', {'plan_code': 'boutique'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'use_checkout_or_change_plan')
        self.assertEqual(self.stripe.subscriptions.calls, [])


class CurrentSerializationTests(BillingTestCase):
    def test_billing_fields_without_stripe_ids(self) -> None:
        since = timezone.now() - timedelta(days=2)
        self._live(status='past_due')
        Subscription.objects.filter(pk=self.subscription.pk).update(
            past_due_since=since, billing_interval='month',
        )
        data = self.api.get(reverse('subscription-current')).data
        self.assertEqual(data['billing_interval'], 'month')
        self.assertEqual(parse_datetime(data['grace_ends_at']), since + timedelta(days=15))  # noqa: E501
        self.assertTrue(data['stripe_managed'])
        self.assertTrue(data['has_billing_customer'])
        self.assertTrue(data['billing_enabled'])
        for key in ('cancel_at_period_end', 'current_period_end', 'past_due_since', 'usage'):  # noqa: E501
            self.assertIn(key, data)
        self.assertNotIn('cus_a', str(data))
        self.assertNotIn('sub_a', str(data))

    def test_defaults_without_billing(self) -> None:
        with override_settings(STRIPE_SECRET_KEY=''):
            data = self.api.get(reverse('subscription-current')).data
        self.assertEqual(
            [data[k] for k in ('billing_interval', 'grace_ends_at', 'stripe_managed', 'has_billing_customer', 'billing_enabled')],  # noqa: E501
            ['', None, False, False, False],
        )


class IsolationAndLeakTests(BillingTestCase):
    def test_other_shops_are_never_touched(self) -> None:
        other_shop, other_owner = _shop_with_owner('Boutique B', 'owner-b@example.com')
        other = _subscribe(other_shop, 'solo', stripe_customer_id='cus_b', stripe_subscription_id='sub_b')  # noqa: E501
        self.stripe.put_subscription(subscription_data('sub_b', 'cus_b'))
        self._live()
        for action in ('cancel', 'refresh', 'portal'):
            self._post(action)
        self.assertNotIn('sub_b', self.stripe.subscriptions.calls)
        self.assertEqual(self.stripe.billing_portal.sessions.last_params['customer'], 'cus_a')  # noqa: E501
        other.refresh_from_db()
        self.assertFalse(other.cancel_at_period_end)

    def test_stripe_errors_are_generic_and_leak_nothing(self) -> None:
        Subscription.objects.filter(pk=self.subscription.pk).update(stripe_customer_id='cus_a')  # noqa: E501
        self.stripe.put_subscription(subscription_data('sub_a', 'cus_a'))
        error = stripe.InvalidRequestError(f'No such price {LEAKY_MESSAGE} {FAKE_KEY}', 'price', code='resource_missing')  # noqa: E501
        self.stripe.checkout.sessions.error = error
        self.stripe.billing_portal.sessions.error = error
        with ExitStack() as stack:
            records = _capture_records(stack, ('apps', 'django.request', 'stripe'))
            responses = [self._post('checkout', {'plan': 'solo', 'interval': 'month'}), self._post('portal')]  # noqa: E501
            self.stripe.subscriptions.failing.add('sub_a')
            responses.append(self._post('refresh'))
        self.assertEqual([r.status_code for r in responses], [502, 502, 502])
        self.assertEqual({r.data['code'] for r in responses}, {'payment_provider_error'})  # noqa: E501
        text = '\n'.join(logging.Formatter().format(r) for r in records)
        self.assertIn('InvalidRequestError', text)
        self.assertIn('resource_missing', text)
        text += '\n'.join(r.content.decode() for r in responses)
        for leak in (LEAKY_MESSAGE, FAKE_KEY, 'cus_a', 'sub_a', 'Traceback'):
            self.assertNotIn(leak, text)
