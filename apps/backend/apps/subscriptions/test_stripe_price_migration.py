"""Changement de prix avant l'ouverture : migration 0014 et `stripe_migrate_prices`.

Aucun appel réseau : `FakeStripeClient` (stripe_fakes.py) garde les anciens prix
(19 / 190 €, 39 / 390 €) et les nouveaux du catalogue (16 / 160 €, 29 / 290 €),
montants compris, et enregistre les paramètres envoyés à Stripe.
"""

from __future__ import annotations

import importlib
from decimal import Decimal
from io import StringIO
from typing import Any
from unittest import mock

import stripe
from django.apps import apps as django_apps
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.shops.factories import ShopFactory
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.stripe_fakes import (
    FAKE_KEY,
    FakeStripeClient,
    price_object,
    subscription_data,
)

COMMAND_CLIENT = 'apps.subscriptions.management.commands.stripe_migrate_prices.get_client'  # noqa: E501
MIGRATION = importlib.import_module(
    'apps.subscriptions.migrations.0014_plan_prices_boutique_commerce_plus',
)
# Anciens prix encore portés par les abonnés (centimes).
OLD_AMOUNTS = {
    'price_solo_month': 900, 'price_solo_year': 9000,
    'price_boutique_month': 1900, 'price_boutique_year': 19000,
    'price_commerce_plus_month': 3900, 'price_commerce_plus_year': 39000,
}
# Nouveaux prix créés par `stripe_sync_plans` : identifiant → (produit, rythme, centimes).  # noqa: E501
NEW_PRICES = {
    'price_boutique_2026_month': ('mizan_boutique', 'month', 1600),
    'price_boutique_2026_year': ('mizan_boutique', 'year', 16000),
    'price_commerce_plus_2026_month': ('mizan_commerce_plus', 'month', 2900),
    'price_commerce_plus_2026_year': ('mizan_commerce_plus', 'year', 29000),
}


def _prices(code: str) -> tuple[Decimal, Decimal]:
    plan = SubscriptionPlan.objects.get(code=code)
    return plan.price_amount, plan.price_yearly_amount


class PlanPricesMigrationTest(TestCase):
    """`0014` : Boutique 16 / 160 €, Commerce+ 29 / 290 € ; retour à 19 / 190 et 39 / 390."""  # noqa: E501

    def test_after_migrate_the_new_grid_is_in_place(self) -> None:
        self.assertEqual(_prices('boutique'), (Decimal('16.00'), Decimal('160.00')))
        self.assertEqual(_prices('commerce_plus'), (Decimal('29.00'), Decimal('290.00')))  # noqa: E501

    def test_backwards_restores_the_old_prices_then_forwards_applies_the_new(self) -> None:  # noqa: E501
        MIGRATION.backwards(django_apps, None)
        self.assertEqual(_prices('boutique'), (Decimal('19.00'), Decimal('190.00')))
        self.assertEqual(_prices('commerce_plus'), (Decimal('39.00'), Decimal('390.00')))  # noqa: E501
        MIGRATION.forwards(django_apps, None)
        self.assertEqual(_prices('boutique'), (Decimal('16.00'), Decimal('160.00')))
        self.assertEqual(_prices('commerce_plus'), (Decimal('29.00'), Decimal('290.00')))  # noqa: E501

    def test_forwards_is_idempotent_and_touches_only_the_two_plans(self) -> None:
        SubscriptionPlan.objects.filter(code='boutique').update(stripe_price_id='price_x')
        before = {
            p.code: (p.name, p.max_members, p.features_json, p.stripe_price_id)
            for p in SubscriptionPlan.objects.all()
        }
        MIGRATION.forwards(django_apps, None)
        MIGRATION.forwards(django_apps, None)
        after = {
            p.code: (p.name, p.max_members, p.features_json, p.stripe_price_id)
            for p in SubscriptionPlan.objects.all()
        }
        self.assertEqual(after, before)
        self.assertEqual(_prices('free'), (Decimal('0.00'), Decimal('0.00')))
        self.assertEqual(_prices('solo'), (Decimal('9.00'), Decimal('90.00')))
        self.assertEqual(_prices('boutique'), (Decimal('16.00'), Decimal('160.00')))

    def test_every_paid_yearly_price_is_ten_months(self) -> None:
        """« 2 mois offerts » : l'annuel vaut 10 mensualités pour chaque formule payante."""  # noqa: E501
        paid = SubscriptionPlan.objects.exclude(code=SubscriptionPlan.CODE_FREE)
        for plan in paid:
            with self.subTest(plan=plan.code):
                self.assertEqual(plan.price_yearly_amount, plan.price_amount * 10)


@override_settings(STRIPE_SECRET_KEY=FAKE_KEY)
class MigratePricesCommandTest(TestCase):
    """Abonnés sur les anciens prix ; catalogue synchronisé sur les nouveaux."""

    def setUp(self) -> None:
        self.stripe = FakeStripeClient()
        self.stripe.prices.amounts.update(OLD_AMOUNTS)
        for price_id, (product, interval, cents) in NEW_PRICES.items():
            self.stripe.prices[price_id] = (product, interval)
            self.stripe.prices.amounts[price_id] = cents
        for code in ('boutique', 'commerce_plus'):
            SubscriptionPlan.objects.filter(code=code).update(
                stripe_price_id=f'price_{code}_2026_month',
                stripe_price_id_yearly=f'price_{code}_2026_year',
            )
        SubscriptionPlan.objects.filter(code='solo').update(
            stripe_price_id='price_solo_month', stripe_price_id_yearly='price_solo_year',  # noqa: E501
        )
        self.count = 0

    def _subscriber(
        self, plan: str = 'boutique', interval: str = 'month', *,
        price: str | None = None, product: str | None = None, status: str = 'active',
        scheduled: str = '', **remote: Any,
    ) -> Subscription:
        """Abonné `sub_<n>` à `plan`, sur l'ancien prix sauf `price` donné."""
        self.count += 1
        sub_id, customer = f'sub_{self.count}', f'cus_{self.count}'
        price = price or f'price_{plan}_{interval}'
        local = SubscriptionFactory(
            shop=ShopFactory(name=f'Épicerie Dupont {self.count}'),
            plan=SubscriptionPlan.objects.get(code=plan),
            billing_interval=interval, scheduled_plan_code=scheduled,
            stripe_customer_id=customer, stripe_subscription_id=sub_id,
        )
        data = subscription_data(
            sub_id, customer, status=status, product=product or f'mizan_{plan}',
            price=price, interval=interval, **remote,
        )
        data['items']['data'][0]['price'] = price_object(price, self.stripe.prices)
        if product is not None:
            data['items']['data'][0]['price']['product'] = product
        self.stripe.put_subscription(data)
        return local

    def _run(self, *args: str) -> str:
        out = StringIO()
        with mock.patch(COMMAND_CLIENT, return_value=self.stripe):
            call_command('stripe_migrate_prices', *args, stdout=out, stderr=out)
        return out.getvalue()

    def _line(self, output: str, subscription: Subscription) -> str:
        prefix = f'  souscription {subscription.pk} : '
        return next(line for line in output.splitlines() if line.startswith(prefix)).removeprefix(prefix)  # noqa: E501

    def _item_price(self, sub_id: str) -> str:
        return self.stripe.subscriptions.items[sub_id]['items']['data'][0]['price']['id']  # noqa: E501

    def test_decrease_is_migrated_without_proration_and_resynced(self) -> None:
        monthly = self._subscriber('boutique', 'month')
        yearly = self._subscriber('commerce_plus', 'year')
        output = self._run()

        self.assertIn('Mode Stripe : test', output)
        self.assertEqual(self._line(output, monthly), 'migré — 19.00 → 16.00 EUR / month')  # noqa: E501
        self.assertEqual(self._line(output, yearly), 'migré — 390.00 → 290.00 EUR / year')  # noqa: E501
        # Ordre des souscriptions : leur identifiant local (UUID), pas leur création.
        self.assertEqual(dict(self.stripe.subscriptions.updates), {
            'sub_1': {
                'items': [{'id': 'si_sub_1_0', 'price': 'price_boutique_2026_month'}],
                'proration_behavior': 'none',
            },
            'sub_2': {
                'items': [{'id': 'si_sub_2_0', 'price': 'price_commerce_plus_2026_year'}],  # noqa: E501
                'proration_behavior': 'none',
            },
        })
        self.assertCountEqual(self.stripe.subscriptions.update_options, [
            {'idempotency_key': f'mizan-price-migrate-{monthly.pk}-price_boutique_2026_month'},  # noqa: E501
            {'idempotency_key': f'mizan-price-migrate-{yearly.pk}-price_commerce_plus_2026_year'},  # noqa: E501
        ])
        self.assertEqual(self._item_price('sub_1'), 'price_boutique_2026_month')
        # Relu une fois pour décider, une fois par la resynchronisation.
        self.assertEqual(sorted(self.stripe.subscriptions.calls), ['sub_1', 'sub_1', 'sub_2', 'sub_2'])  # noqa: E501
        monthly.refresh_from_db()
        self.assertEqual((monthly.plan.code, monthly.billing_interval), ('boutique', 'month'))  # noqa: E501
        self.assertIn('Total : 2 souscription(s) — 2 migré, 0 ignoré, 0 en erreur.', output)  # noqa: E501
        # Catalogue lu une fois par prix cible.
        self.assertEqual(sorted(self.stripe.prices.calls), ['price_boutique_2026_month', 'price_commerce_plus_2026_year'])  # noqa: E501

    def test_second_run_finds_nothing_to_migrate(self) -> None:
        self._subscriber('boutique', 'month')
        self._run()
        output = self._run()
        self.assertIn('ignoré — déjà au prix du catalogue', output)
        self.assertEqual(len(self.stripe.subscriptions.updates), 1)

    def test_increase_same_amount_and_unchanged_plan_are_ignored(self) -> None:
        self.stripe.prices['price_boutique_promo_month'] = ('mizan_boutique', 'month')
        self.stripe.prices.amounts['price_boutique_promo_month'] = 1200
        self.stripe.prices['price_boutique_alt_month'] = ('mizan_boutique', 'month')
        self.stripe.prices.amounts['price_boutique_alt_month'] = 1600
        increase = self._subscriber('boutique', 'month', price='price_boutique_promo_month')  # noqa: E501
        same = self._subscriber('boutique', 'month', price='price_boutique_alt_month')
        solo = self._subscriber('solo', 'month')
        output = self._run()

        self.assertEqual(
            self._line(output, increase),
            'ignoré — hausse (12.00 → 16.00 EUR / month) : procédure à part, avec préavis',  # noqa: E501
        )
        self.assertEqual(self._line(output, same), 'ignoré — même montant (16.00 → 16.00 EUR / month)')  # noqa: E501
        self.assertEqual(self._line(output, solo), 'ignoré — déjà au prix du catalogue')
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_unknown_prices_are_ignored(self) -> None:
        other_product = self._subscriber('boutique', 'month', product='prod_autre')
        self.stripe.prices['price_sans_montant'] = ('mizan_boutique', 'month')
        no_amount = self._subscriber('boutique', 'month', price='price_sans_montant')
        output = self._run()

        self.assertEqual(self._line(output, other_product), 'ignoré — prix inconnu (produit ou rythme non reconnu)')  # noqa: E501
        self.assertEqual(self._line(output, no_amount), 'ignoré — prix actuel inconnu')
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_catalogue_not_synced_is_ignored(self) -> None:
        stale = self._subscriber('boutique', 'month')
        # Prix du catalogue encore à l'ancien montant : stripe_sync_plans pas lancé.
        self.stripe.prices.amounts['price_boutique_2026_month'] = 1900
        SubscriptionPlan.objects.filter(code='commerce_plus').update(stripe_price_id_yearly='')  # noqa: E501
        missing = self._subscriber('commerce_plus', 'year')
        output = self._run()

        for subscription in (stale, missing):
            self.assertEqual(
                self._line(output, subscription),
                'ignoré — catalogue non synchronisé (lancer stripe_sync_plans)',
            )
        self.assertEqual(self.stripe.subscriptions.updates, [])

    def test_schedule_past_due_and_cancellation_are_ignored(self) -> None:
        cases = {
            'changement de formule programmé : à traiter à la main': (
                self._subscriber(schedule='sub_sched_1'),
                self._subscriber(scheduled='solo'),
            ),
            'paiement en retard': (
                self._subscriber(status='past_due'), self._subscriber(status='unpaid'),
            ),
            'abonnement résilié': (self._subscriber(status='canceled'),),
            'résiliation programmée': (
                self._subscriber(cancel_at_period_end=True),
                self._subscriber(cancel_at=1_792_592_000),
            ),
            'statut Stripe incomplete non pris en charge': (
                self._subscriber(status='incomplete'),
            ),
        }
        output = self._run()

        for reason, subscriptions in cases.items():
            for subscription in subscriptions:
                with self.subTest(reason=reason, subscription=subscription.pk):
                    self.assertEqual(self._line(output, subscription), f'ignoré — {reason}')  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self.stripe.subscription_schedules.calls, [])
        self.assertEqual(self.stripe.prices.calls, [])

    def test_trialing_on_stripe_is_migrated(self) -> None:
        trialing = self._subscriber(status='trialing')
        output = self._run()
        self.assertEqual(self._line(output, trialing), 'migré — 19.00 → 16.00 EUR / month')  # noqa: E501

    def test_subscriptions_without_stripe_id_are_not_listed(self) -> None:
        SubscriptionFactory(plan=SubscriptionPlan.objects.get(code='free'))
        output = self._run()
        self.assertIn('Total : 0 souscription(s)', output)
        self.assertEqual(self.stripe.subscriptions.calls, [])

    def test_dry_run_writes_nothing(self) -> None:
        subscription = self._subscriber('boutique', 'month')
        before = Subscription.objects.filter(pk=subscription.pk).values().get()
        output = self._run('--dry-run')

        self.assertIn('Mode Stripe : test — simulation, rien ne sera écrit', output)
        self.assertEqual(self._line(output, subscription), 'à migrer — 19.00 → 16.00 EUR / month')  # noqa: E501
        self.assertIn('Total : 1 souscription(s) — 1 à migrer, 0 ignoré, 0 en erreur.', output)  # noqa: E501
        self.assertEqual(self.stripe.subscriptions.updates, [])
        self.assertEqual(self._item_price('sub_1'), 'price_boutique_month')
        self.assertEqual(Subscription.objects.filter(pk=subscription.pk).values().get(), before)  # noqa: E501

    @override_settings(STRIPE_SECRET_KEY='')
    def test_refused_without_key(self) -> None:
        with self.assertRaisesMessage(CommandError, 'STRIPE_SECRET_KEY absente'):
            self._run()

    @override_settings(STRIPE_SECRET_KEY='sk_live_fake_key_for_mizan_tests')
    def test_live_key_refused_without_allow_live(self) -> None:
        self._subscriber('boutique', 'month')
        with self.assertRaisesMessage(CommandError, '--allow-live') as ctx:
            self._run('--dry-run')
        self.assertNotIn('sk_live_fake_key_for_mizan_tests', str(ctx.exception))
        self.assertEqual(self.stripe.subscriptions.calls, [])

    @override_settings(STRIPE_SECRET_KEY='rk_live_fake_key_for_mizan_tests')
    def test_live_key_with_allow_live_reports_production(self) -> None:
        self._subscriber('boutique', 'month')
        output = self._run('--allow-live', '--dry-run')
        self.assertIn('Mode Stripe : PRODUCTION — simulation', output)
        self.assertNotIn('rk_live_fake_key_for_mizan_tests', output)

    def test_stripe_error_does_not_stop_the_others(self) -> None:
        unreachable = self._subscriber('boutique', 'month')
        refused = self._subscriber('boutique', 'year')
        migrated = self._subscriber('commerce_plus', 'month')
        self.stripe.subscriptions.failing.add('sub_1')
        original = self.stripe.subscriptions.update

        def update(id: str, params: Any = None, options: Any = None) -> Any:  # noqa: A002
            if id == 'sub_2':
                raise stripe.InvalidRequestError('No such price: price_x on sub_2', 'items', code='resource_missing')  # noqa: E501
            return original(id, params, options)

        with mock.patch.object(self.stripe.subscriptions, 'update', side_effect=update):
            output = self._run()

        self.assertEqual(self._line(output, unreachable), 'erreur — erreur Stripe APIConnectionError, code -')  # noqa: E501
        self.assertEqual(self._line(output, refused), 'erreur — erreur Stripe InvalidRequestError, code resource_missing')  # noqa: E501
        self.assertEqual(self._line(output, migrated), 'migré — 39.00 → 29.00 EUR / month')  # noqa: E501
        self.assertIn('Total : 3 souscription(s) — 1 migré, 0 ignoré, 2 en erreur.', output)  # noqa: E501
        self.assertEqual(self._item_price('sub_3'), 'price_commerce_plus_2026_month')

    def test_output_has_no_personal_data_nor_stripe_id(self) -> None:
        self._subscriber('boutique', 'month')
        self._subscriber('boutique', 'month', price='price_boutique_promo_month')
        self._subscriber(status='past_due')
        self.stripe.subscriptions.failing.add('sub_3')
        output = self._run()

        for leak in ('sub_', 'cus_', 'si_', 'price_', 'prod_', 'mizan_', 'Dupont', '@'):
            with self.subTest(leak=leak):
                self.assertNotIn(leak, output)
        self.assertNotIn(FAKE_KEY, output)
