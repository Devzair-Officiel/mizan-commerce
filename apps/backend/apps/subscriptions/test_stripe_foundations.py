"""Fondations Stripe Billing (lot 1) : catalogue, client, permission, événements.

Aucun appel réseau : `FakeStripeClient` imite en mémoire les quelques appels
`v1.products` / `v1.prices` utilisés par `stripe_catalog`, y compris le refus
de Stripe de donner une lookup_key déjà prise sans `transfer_lookup_key`.
"""

from __future__ import annotations

from decimal import Decimal
from io import StringIO
from types import SimpleNamespace
from typing import Any
from unittest import mock

import stripe
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from apps.accounts.factories import UserFactory
from apps.core.models import AuditLog
from apps.core.permissions import IsShopOwner
from apps.shops.factories import ShopMemberFactory
from apps.subscriptions.models import StripeEvent, SubscriptionPlan
from apps.subscriptions.stripe_catalog import sync_catalog, to_cents
from apps.subscriptions.stripe_client import billing_enabled, get_client, is_live_mode

TEST_KEY = 'sk_test_fake_key_for_mizan_tests'
COMMAND_CLIENT = 'apps.subscriptions.management.commands.stripe_sync_plans.get_client'


class _FakeProducts:
    def __init__(self) -> None:
        self.items: dict[str, SimpleNamespace] = {}
        self.created: list[str] = []
        self.updated: list[str] = []

    def retrieve(self, id: str, params: Any = None, options: Any = None) -> SimpleNamespace:  # noqa: A002, E501
        if id not in self.items:
            raise stripe.InvalidRequestError(f'No such product: {id}', 'id', code='resource_missing')  # noqa: E501
        return self.items[id]

    def create(self, params: dict[str, Any], options: Any = None) -> SimpleNamespace:
        product = SimpleNamespace(
            id=params['id'], name=params['name'],
            description=params.get('description'), metadata=params['metadata'],
        )
        self.items[product.id] = product
        self.created.append(product.id)
        return product

    def update(self, id: str, params: dict[str, Any], options: Any = None) -> SimpleNamespace:  # noqa: A002, E501
        product = self.items[id]
        product.name = params['name']
        product.description = params['description'] or None
        self.updated.append(id)
        return product


class _FakePrices:
    def __init__(self) -> None:
        self.items: list[SimpleNamespace] = []
        self.created: list[dict[str, Any]] = []

    def list(self, params: dict[str, Any], options: Any = None) -> SimpleNamespace:
        found = [p for p in self.items if p.lookup_key in params['lookup_keys']]
        return SimpleNamespace(data=found[:params.get('limit', 10)])

    def create(self, params: dict[str, Any], options: Any = None) -> SimpleNamespace:
        holder = next((p for p in self.items if p.lookup_key == params['lookup_key']), None)  # noqa: E501
        if holder is not None:
            if not params.get('transfer_lookup_key'):
                raise stripe.InvalidRequestError('lookup_key already in use', 'lookup_key')  # noqa: E501
            holder.lookup_key = None
        price = SimpleNamespace(
            id=f'price_{len(self.items) + 1}', product=params['product'],
            unit_amount=params['unit_amount'], currency=params['currency'],
            recurring=SimpleNamespace(interval=params['recurring']['interval']),
            lookup_key=params['lookup_key'], active=True,
        )
        self.items.append(price)
        self.created.append(params)
        return price

    def by_key(self, lookup_key: str) -> SimpleNamespace:
        return next(p for p in self.items if p.lookup_key == lookup_key)


class FakeStripeClient:
    def __init__(self) -> None:
        self.products = _FakeProducts()
        self.prices = _FakePrices()
        self.v1 = SimpleNamespace(products=self.products, prices=self.prices)


def _plan(code: str) -> SubscriptionPlan:
    return SubscriptionPlan.objects.get(code=code)


class ToCentsTest(SimpleTestCase):
    def test_whole_and_decimal_amounts(self) -> None:
        self.assertEqual(to_cents(Decimal('9')), 900)
        self.assertEqual(to_cents(Decimal('19.99')), 1999)
        self.assertEqual(to_cents(Decimal('390.00')), 39000)

    def test_rounds_half_up(self) -> None:
        self.assertEqual(to_cents(Decimal('9.995')), 1000)
        self.assertEqual(to_cents(Decimal('9.994')), 999)
        self.assertEqual(to_cents(Decimal('0.005')), 1)


class SyncCatalogTest(TestCase):
    def setUp(self) -> None:
        self.fake = FakeStripeClient()

    def test_creates_six_prices_with_amounts_in_cents(self) -> None:
        sync_catalog(self.fake, dry_run=False)
        amounts = {p['lookup_key']: p['unit_amount'] for p in self.fake.prices.created}
        self.assertEqual(amounts, {
            'solo_monthly': 900, 'solo_yearly': 9000,
            'boutique_monthly': 1900, 'boutique_yearly': 19000,
            'commerce_plus_monthly': 3900, 'commerce_plus_yearly': 39000,
        })
        for params in self.fake.prices.created:
            self.assertEqual(params['currency'], 'eur')
            self.assertNotIn('tax_behavior', params)
            expected = 'year' if params['lookup_key'].endswith('_yearly') else 'month'
            self.assertEqual(params['recurring'], {'interval': expected})
            self.assertEqual(params['product'], f"mizan_{params['metadata']['plan_code']}")  # noqa: E501
        self.assertEqual(
            sorted(self.fake.products.created),
            ['mizan_boutique', 'mizan_commerce_plus', 'mizan_solo'],
        )
        self.assertEqual(self.fake.products.items['mizan_solo'].metadata, {'plan_code': 'solo'})  # noqa: E501

    def test_stores_price_ids_on_plans(self) -> None:
        sync_catalog(self.fake, dry_run=False)
        for code in ('solo', 'boutique', 'commerce_plus'):
            plan = _plan(code)
            self.assertEqual(plan.stripe_price_id, self.fake.prices.by_key(f'{code}_monthly').id)  # noqa: E501
            self.assertEqual(plan.stripe_price_id_yearly, self.fake.prices.by_key(f'{code}_yearly').id)  # noqa: E501

    def test_free_plan_is_ignored(self) -> None:
        sync_catalog(self.fake, dry_run=False)
        self.assertNotIn('mizan_free', self.fake.products.items)
        free = _plan(SubscriptionPlan.CODE_FREE)
        self.assertEqual((free.stripe_price_id, free.stripe_price_id_yearly), ('', ''))

    def test_inactive_plan_is_ignored(self) -> None:
        SubscriptionPlan.objects.filter(code='boutique').update(is_active=False)
        sync_catalog(self.fake, dry_run=False)
        self.assertNotIn('mizan_boutique', self.fake.products.items)
        self.assertEqual(len(self.fake.prices.created), 4)
        self.assertEqual(_plan('boutique').stripe_price_id, '')

    def test_no_yearly_price_without_yearly_amount(self) -> None:
        SubscriptionPlan.objects.filter(code='solo').update(price_yearly_amount=Decimal('0'))
        sync_catalog(self.fake, dry_run=False)
        keys = [p['lookup_key'] for p in self.fake.prices.created]
        self.assertNotIn('solo_yearly', keys)
        self.assertEqual(_plan('solo').stripe_price_id_yearly, '')

    def test_second_run_creates_nothing(self) -> None:
        sync_catalog(self.fake, dry_run=False)
        results = sync_catalog(self.fake, dry_run=False)
        self.assertEqual(len(self.fake.prices.created), 6)
        self.assertEqual(len(self.fake.products.created), 3)
        self.assertEqual(self.fake.products.updated, [])
        actions = {p.action for r in results for p in r.prices} | {r.product_action for r in results}  # noqa: E501
        self.assertEqual(actions, {'inchangé'})

    def test_price_change_creates_new_price_and_keeps_old_active(self) -> None:
        sync_catalog(self.fake, dry_run=False)
        old = self.fake.prices.by_key('solo_monthly')
        SubscriptionPlan.objects.filter(code='solo').update(price_amount=Decimal('10'))
        sync_catalog(self.fake, dry_run=False)

        self.assertEqual(len(self.fake.prices.created), 7)
        new = self.fake.prices.by_key('solo_monthly')
        self.assertEqual(new.unit_amount, 1000)
        self.assertTrue(self.fake.prices.created[-1]['transfer_lookup_key'])
        self.assertTrue(old.active)
        self.assertIsNone(old.lookup_key)
        self.assertEqual(_plan('solo').stripe_price_id, new.id)

    def test_rename_updates_product_only(self) -> None:
        sync_catalog(self.fake, dry_run=False)
        SubscriptionPlan.objects.filter(code='solo').update(name='Solo Pro')
        results = sync_catalog(self.fake, dry_run=False)

        self.assertEqual(self.fake.products.updated, ['mizan_solo'])
        self.assertEqual(self.fake.products.items['mizan_solo'].name, 'Solo Pro')
        self.assertEqual(len(self.fake.prices.created), 6)
        solo = next(r for r in results if r.plan_code == 'solo')
        self.assertEqual(solo.product_action, 'mis à jour')


@override_settings(STRIPE_SECRET_KEY=TEST_KEY)
class SyncPlansCommandTest(TestCase):
    def setUp(self) -> None:
        self.fake = FakeStripeClient()

    def _run(self, *args: str) -> str:
        out = StringIO()
        with mock.patch(COMMAND_CLIENT, return_value=self.fake):
            call_command('stripe_sync_plans', *args, stdout=out, stderr=out)
        return out.getvalue()

    def test_reports_mode_and_one_line_per_price(self) -> None:
        output = self._run()
        self.assertIn('Mode Stripe : test', output)
        self.assertEqual(output.count(': créé price_'), 6)
        self.assertNotIn(TEST_KEY, output)

    def test_second_run_reports_unchanged(self) -> None:
        self._run()
        output = self._run()
        self.assertEqual(output.count('inchangé'), 9)  # 3 produits + 6 prix

    def test_dry_run_writes_nothing(self) -> None:
        output = self._run('--dry-run')
        self.assertIn('simulation', output)
        self.assertEqual(self.fake.products.created, [])
        self.assertEqual(self.fake.prices.created, [])
        self.assertFalse(
            SubscriptionPlan.objects.exclude(stripe_price_id='', stripe_price_id_yearly='').exists(),  # noqa: E501
        )

    def test_dry_run_after_price_change_keeps_plan_ids(self) -> None:
        self._run()
        before = _plan('solo').stripe_price_id
        SubscriptionPlan.objects.filter(code='solo').update(price_amount=Decimal('10'))
        output = self._run('--dry-run')
        self.assertIn('remplacé', output)
        self.assertEqual(len(self.fake.prices.created), 6)
        self.assertEqual(_plan('solo').stripe_price_id, before)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_refused_without_key(self) -> None:
        with self.assertRaisesMessage(CommandError, 'STRIPE_SECRET_KEY absente'):
            self._run()

    @override_settings(STRIPE_SECRET_KEY='sk_live_fake_key_for_mizan_tests')
    def test_refused_with_live_key_without_allow_live(self) -> None:
        with self.assertRaisesMessage(CommandError, '--allow-live') as ctx:
            self._run('--dry-run')
        self.assertNotIn('sk_live_fake_key_for_mizan_tests', str(ctx.exception))
        self.assertEqual(self.fake.prices.created, [])

    @override_settings(STRIPE_SECRET_KEY='rk_live_fake_key_for_mizan_tests')
    def test_live_key_with_allow_live_reports_production(self) -> None:
        output = self._run('--allow-live')
        self.assertIn('Mode Stripe : PRODUCTION', output)
        self.assertNotIn('rk_live_fake_key_for_mizan_tests', output)

    def test_stripe_error_shows_message_without_key(self) -> None:
        error = stripe.AuthenticationError(f'Invalid API Key provided: {TEST_KEY}')
        with mock.patch.object(self.fake.products, 'retrieve', side_effect=error):
            with self.assertRaises(CommandError) as ctx:
                self._run()
        self.assertEqual(str(ctx.exception), 'Erreur Stripe : Invalid API Key provided: ***')  # noqa: E501


class StripeClientTest(SimpleTestCase):
    @override_settings(STRIPE_SECRET_KEY='')
    def test_disabled_without_key(self) -> None:
        self.assertFalse(billing_enabled())
        with self.assertRaises(ImproperlyConfigured):
            get_client()

    @override_settings(STRIPE_SECRET_KEY=TEST_KEY)
    def test_test_key(self) -> None:
        self.assertTrue(billing_enabled())
        self.assertFalse(is_live_mode())
        self.assertIsInstance(get_client(), stripe.StripeClient)

    def test_live_keys(self) -> None:
        for key in ('sk_live_x', 'rk_live_x'):
            with self.subTest(key=key), override_settings(STRIPE_SECRET_KEY=key):
                self.assertTrue(is_live_mode())


class IsShopOwnerTest(TestCase):
    def _allowed(self, user: Any) -> bool:
        request = RequestFactory().post('/')
        request.user = user
        return IsShopOwner().has_permission(request, None)

    def test_owner_allowed(self) -> None:
        self.assertTrue(self._allowed(ShopMemberFactory(role='owner').user))

    def test_admin_and_staff_refused(self) -> None:
        for role in ('admin', 'staff'):
            with self.subTest(role=role):
                self.assertFalse(self._allowed(ShopMemberFactory(role=role).user))

    def test_user_without_shop_refused(self) -> None:
        self.assertFalse(self._allowed(UserFactory()))

    def test_anonymous_refused(self) -> None:
        self.assertFalse(self._allowed(AnonymousUser()))


class StripeEventTest(TestCase):
    def test_get_or_create_is_idempotent_on_event_id(self) -> None:
        defaults = {'event_type': 'invoice.paid', 'stripe_created_at': timezone.now()}
        _, created = StripeEvent.objects.get_or_create(id='evt_123', defaults=defaults)
        self.assertTrue(created)
        _, created = StripeEvent.objects.get_or_create(id='evt_123', defaults=defaults)
        self.assertFalse(created)
        self.assertEqual(StripeEvent.objects.count(), 1)


class SchemaTest(TestCase):
    def test_migrations_up_to_date(self) -> None:
        try:
            call_command('makemigrations', check=True, dry_run=True, stdout=StringIO())
        except SystemExit:  # pragma: no cover — message de makemigrations
            self.fail('Migrations manquantes : lancer makemigrations.')

    def test_audit_actions_fit_max_length(self) -> None:
        max_length = AuditLog._meta.get_field('action').max_length
        values = [value for value, _ in AuditLog.ACTION_CHOICES]
        for value in values:
            self.assertLessEqual(len(value), max_length, value)
        for action in (
            'subscription_started', 'subscription_plan_changed',
            'subscription_cancel_scheduled', 'subscription_cancel_reverted',
            'subscription_payment_failed', 'subscription_ended', 'subscription_dispute',
        ):
            self.assertIn(action, values)
