"""Grille des formules (lot 7b) : gating par formule, limites, migration.

- Une formule = une ligne de la matrice : chaque fonctionnalité branchée est
  autorisée ou refusée (403) selon `FEATURE_MIN_PLAN`.
- Une limite = un dépassement (400 `plan_limit_exceeded`) et une course entre
  deux créations simultanées (`TransactionTestCase`, vraie concurrence Postgres).
- Multi-tenant : les compteurs d'une boutique ignorent les objets des autres.
- Migration `0004_rename_plans` : anciens codes → nouveaux, mêmes PK, souscriptions
  conservées.
"""

from __future__ import annotations

import importlib
import threading
import time
import uuid
from collections.abc import Callable
from datetime import timedelta
from unittest import mock

from django.apps import apps as django_apps
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.ocr.models import ProductScanUsage
from apps.ocr.services import scan_quota_month
from apps.orders.models import Order
from apps.products.models import Product
from apps.shops.models import Shop, ShopMember
from apps.subscriptions import limits
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.permissions import FEATURE_MIN_PLAN
from apps.subscriptions.services import start_trial_or_default
from apps.subscriptions.test_utils import attach_subscription

FREE = SubscriptionPlan.CODE_FREE
SOLO = SubscriptionPlan.CODE_SOLO
BOUTIQUE = SubscriptionPlan.CODE_BOUTIQUE
COMMERCE_PLUS = SubscriptionPlan.CODE_COMMERCE_PLUS


def make_shop(email: str, plan_code: str) -> tuple[User, Shop]:
    user = User.objects.create_user(email=email, password='StrongPass123!')
    shop = Shop.objects.create(name=f'Shop {email}', currency='EUR', country='FR')
    ShopMember.objects.create(shop=shop, user=user, role=ShopMember.ROLE_OWNER)
    attach_subscription(shop, plan_code=plan_code)
    return user, shop


def add_staff(shop: Shop, count: int) -> None:
    for _ in range(count):
        user = User.objects.create_user(
            email=f'staff-{uuid.uuid4().hex[:8]}@example.com',
            password='StrongPass123!',
        )
        ShopMember.objects.create(shop=shop, user=user, role=ShopMember.ROLE_STAFF)


class PlanCatalogTest(TestCase):
    """Les 4 formules seedées, cohérentes avec le gating."""

    def test_four_plans_in_tier_order(self) -> None:
        plans = SubscriptionPlan.objects.filter(is_active=True).order_by('price_amount')
        self.assertEqual(
            [(p.code, p.name, str(p.price_amount)) for p in plans],
            [
                (FREE, 'Découverte', '0.00'),
                (SOLO, 'Solo', '9.00'),
                (BOUTIQUE, 'Boutique', '16.00'),
                (COMMERCE_PLUS, 'Commerce+', '29.00'),
            ],
        )

    def test_features_json_matches_feature_min_plan(self) -> None:
        """`features_json` = toutes les clés dont le palier est atteint."""
        for plan in SubscriptionPlan.objects.all():
            expected = {
                feature
                for feature, code in FEATURE_MIN_PLAN.items()
                if SubscriptionPlan.TIER_ORDER.index(code) <= plan.tier
            }
            with self.subTest(plan=plan.code):
                self.assertEqual(set(plan.features_json), expected)

    def test_limits(self) -> None:
        rows = {
            p.code: (
                p.max_products,
                p.max_orders_per_month,
                p.max_customers,
                p.max_members,
            )
            for p in SubscriptionPlan.objects.all()
        }
        self.assertEqual(
            rows,
            {
                FREE: (30, 15, 15, 1),
                SOLO: (None, None, None, 1),
                BOUTIQUE: (None, None, None, 4),
                COMMERCE_PLUS: (None, None, None, None),
            },
        )

    def test_vision_scan_quotas(self) -> None:
        """Quota mensuel du secours vision du scan d'emballage (URS-109)."""
        plans = SubscriptionPlan.objects.all()
        self.assertEqual(
            {p.code: p.max_vision_scans_per_month for p in plans},
            {FREE: 5, SOLO: 30, BOUTIQUE: 100, COMMERCE_PLUS: 300},
        )

    def test_text_scan_quotas(self) -> None:
        """Lectures avancées du scan d'emballage par mois (URS-109)."""
        plans = SubscriptionPlan.objects.all()
        self.assertEqual(
            {p.code: p.max_text_scans_per_month for p in plans},
            {FREE: 10, SOLO: 30, BOUTIQUE: 60, COMMERCE_PLUS: 130},
        )

    def test_plans_endpoint_lists_the_grid(self) -> None:
        user, _ = make_shop('plans@example.com', FREE)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/subscriptions/plans/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [p['code'] for p in response.data],
            list(SubscriptionPlan.TIER_ORDER),
        )
        self.assertIn('max_members', response.data[0])
        self.assertEqual(
            [p['price_yearly_amount'] for p in response.data],
            ['0.00', '90.00', '160.00', '290.00'],
        )
        self.assertNotIn('stripe_price_id_yearly', response.data[0])

    def test_plans_endpoint_requires_authentication(self) -> None:
        response = APIClient().get('/api/subscriptions/plans/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# Sonde HTTP par fonctionnalité branchée : (méthode, URL). Une sonde autorisée
# peut répondre 200, 400, 404 ou 405 selon la vue : seul le 403 compte, sauf pour
# les sondes strictes (STRICT_PROBES), qui exigent 200.
FEATURE_PROBES: dict[str, tuple[str, str]] = {
    'orders': ('get', '/api/orders/'),
    'zakat': ('get', '/api/zakat/sources/'),
    'invoices': ('get', '/api/invoices/'),
    'whatsapp': ('get', '/api/messages/settings/'),
    'exports': ('get', f'/api/customers/{uuid.uuid4()}/activity/export/summary/'),
    'ocr': ('post', '/api/ocr/invoices/'),
    'public_pages': ('get', '/api/public-page/'),
    'multi_user': ('post', '/api/shop/members/'),
    'product_scan': ('post', '/api/ocr/product-scan/'),
}

# Une sonde stricte autorisée doit répondre 200 : un 404 (route disparue) échoue.
STRICT_PROBES: frozenset[str] = frozenset({'zakat'})


class PlanGatingMatrixTest(TestCase):
    """Un test par formule : chaque fonctionnalité branchée autorisée ou refusée."""

    def _assert_plan(self, plan_code: str) -> None:
        user, _ = make_shop(f'{plan_code}@example.com', plan_code)
        client = APIClient()
        client.force_authenticate(user=user)
        tier = SubscriptionPlan.TIER_ORDER.index(plan_code)
        for feature, (method, url) in FEATURE_PROBES.items():
            allowed = (
                SubscriptionPlan.TIER_ORDER.index(FEATURE_MIN_PLAN[feature]) <= tier
            )
            response = getattr(client, method)(url, {}, format='json')
            with self.subTest(feature=feature):
                if allowed and feature in STRICT_PROBES:
                    self.assertEqual(response.status_code, status.HTTP_200_OK)
                elif allowed:
                    self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                else:
                    self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_free(self) -> None:
        self._assert_plan(FREE)

    def test_solo(self) -> None:
        self._assert_plan(SOLO)

    def test_boutique(self) -> None:
        self._assert_plan(BOUTIQUE)

    def test_commerce_plus(self) -> None:
        self._assert_plan(COMMERCE_PLUS)

    def test_grid_placement(self) -> None:
        """Les fonctionnalités branchées sont au bon palier."""
        self.assertEqual(
            {f: FEATURE_MIN_PLAN[f] for f in FEATURE_PROBES},
            {
                'orders': FREE,
                'zakat': FREE,
                'invoices': SOLO,
                'whatsapp': SOLO,
                'exports': BOUTIQUE,
                'ocr': BOUTIQUE,
                'public_pages': BOUTIQUE,
                'multi_user': BOUTIQUE,
                'product_scan': FREE,
            },
        )


class InvoiceBrandingTest(TestCase):
    """Logo et couleur sur la facture : formule Boutique et au-delà."""

    def _presentation(self, plan_code: str) -> tuple[dict, str]:
        from apps.invoices.settings import example_invoice, resolved_color

        _, shop = make_shop(f'brand-{plan_code}@example.com', plan_code)
        shop.invoice_color_mode = 'custom'
        shop.invoice_color = '#9c4f2c'
        shop.logo_object_key = 'shops/x/logo.png'
        shop.save()
        return example_invoice(shop, 'fr').presentation, resolved_color(shop)

    def test_solo_invoice_is_neutral(self) -> None:
        presentation, _ = self._presentation(SOLO)
        self.assertEqual(presentation['color'], '')
        self.assertEqual(presentation['logo_object_key'], '')

    def test_boutique_invoice_is_branded(self) -> None:
        presentation, color = self._presentation(BOUTIQUE)
        self.assertTrue(color)
        self.assertEqual(presentation['color'], color)
        self.assertEqual(presentation['logo_object_key'], 'shops/x/logo.png')


class LimitExceededTest(TestCase):
    """Un test par limite : la création au-delà du plafond renvoie 400."""

    def setUp(self) -> None:
        self.user, self.shop = make_shop('limits@example.com', FREE)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _assert_limit_error(
        self,
        response,
        feature: str,
        limit: int,
        plan_name: str = 'Découverte',
    ) -> None:
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'plan_limit_exceeded')
        self.assertEqual(response.data['feature'], feature)
        # `ValidationError` sérialise les valeurs en chaînes (format existant).
        self.assertEqual(response.data['limit'], str(limit))
        self.assertEqual(response.data['current'], str(limit))
        self.assertIn(plan_name, response.data['detail'])

    def test_products(self) -> None:
        Product.objects.bulk_create(
            Product(shop=self.shop, name=f'P{i}') for i in range(30)
        )
        Product.objects.create(shop=self.shop, name='Archivé', is_active=False)
        response = self.client.post(
            '/api/products/', {'name': 'De trop'}, format='json'
        )
        self._assert_limit_error(response, 'products', 30)
        self.assertEqual(Product.objects.filter(shop=self.shop).count(), 31)

    def test_orders_per_month(self) -> None:
        Order.objects.bulk_create(
            Order(shop=self.shop, order_number=f'2026-{i:03d}', created_by=self.user)
            for i in range(15)
        )
        # La limite passe avant la recherche des variantes : variante fictive.
        response = self.client.post(
            '/api/orders/',
            {
                'items': [{'variant': str(uuid.uuid4()), 'quantity': 1}],
            },
            format='json',
        )
        self._assert_limit_error(response, 'orders', 15)
        self.assertEqual(Order.objects.filter(shop=self.shop).count(), 15)

    def test_customers(self) -> None:
        Customer.objects.bulk_create(
            Customer(shop=self.shop, name=f'C{i}') for i in range(15)
        )
        Customer.objects.create(shop=self.shop, name='Inactif', is_active=False)
        response = self.client.post(
            '/api/customers/', {'name': 'De trop'}, format='json'
        )
        self._assert_limit_error(response, 'customers', 15)

    def test_product_reactivation(self) -> None:
        """Réactiver reprend un slot : refusé à la limite (action et PATCH)."""
        Product.objects.bulk_create(
            Product(shop=self.shop, name=f'P{i}') for i in range(30)
        )
        archived = Product.objects.create(
            shop=self.shop, name='Archivé', is_active=False
        )
        response = self.client.post(f'/api/products/{archived.pk}/reactivate/')
        self._assert_limit_error(response, 'products', 30)
        response = self.client.patch(
            f'/api/products/{archived.pk}/', {'is_active': True}, format='json'
        )
        self._assert_limit_error(response, 'products', 30)
        archived.refresh_from_db()
        self.assertFalse(archived.is_active)

        Product.objects.filter(shop=self.shop, name='P0').update(is_active=False)
        response = self.client.post(f'/api/products/{archived.pk}/reactivate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        archived.refresh_from_db()
        self.assertTrue(archived.is_active)

    def test_customer_reactivation(self) -> None:
        Customer.objects.bulk_create(
            Customer(shop=self.shop, name=f'C{i}') for i in range(15)
        )
        inactive = Customer.objects.create(
            shop=self.shop, name='Inactif', is_active=False
        )
        url = f'/api/customers/{inactive.pk}/'
        response = self.client.patch(url, {'is_active': True}, format='json')
        self._assert_limit_error(response, 'customers', 15)
        inactive.refresh_from_db()
        self.assertFalse(inactive.is_active)
        # Modifier un client actif à la limite reste possible.
        active = Customer.objects.filter(shop=self.shop).first()
        response = self.client.patch(
            f'/api/customers/{active.pk}/', {'city': 'Lyon'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_members_on_boutique(self) -> None:
        """Boutique : propriétaire + 3. Le 5e membre est refusé."""
        attach_subscription(self.shop, plan_code=BOUTIQUE)
        add_staff(self.shop, 3)
        response = self.client.post(
            '/api/shop/members/',
            {
                'email': 'cinquieme@example.com',
                'full_name': 'Cinquième',
                'password': 'StrongPass123!',
                'permissions': [],
            },
            format='json',
        )
        self._assert_limit_error(response, 'members', 4, plan_name='Boutique')
        self.assertFalse(User.objects.filter(email='cinquieme@example.com').exists())

    def test_members_on_commerce_plus_are_unlimited(self) -> None:
        attach_subscription(self.shop, plan_code=COMMERCE_PLUS)
        add_staff(self.shop, 5)
        response = self.client.post(
            '/api/shop/members/',
            {
                'email': 'septieme@example.com',
                'full_name': 'Septième',
                'password': 'StrongPass123!',
                'permissions': [],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_paid_plans_have_no_quantity_limit(self) -> None:
        attach_subscription(self.shop, plan_code=SOLO)
        Product.objects.bulk_create(
            Product(shop=self.shop, name=f'P{i}') for i in range(40)
        )
        Customer.objects.bulk_create(
            Customer(shop=self.shop, name=f'C{i}') for i in range(20)
        )
        response = self.client.post('/api/products/', {'name': 'Encore'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response = self.client.post(
            '/api/customers/', {'name': 'Encore'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class UsageTest(TestCase):
    """GET /subscriptions/current/ expose l'usage de la boutique face à sa formule."""

    def test_counts_and_limits_of_the_shop_only(self) -> None:
        user, shop = make_shop('usage@example.com', FREE)
        other_user, other = make_shop('usage-other@example.com', FREE)
        Product.objects.bulk_create(Product(shop=shop, name=f'P{i}') for i in range(3))
        Product.objects.create(shop=shop, name='Archivé', is_active=False)
        Customer.objects.create(shop=shop, name='Client')
        Customer.objects.create(shop=shop, name='Inactif', is_active=False)
        Order.objects.create(shop=shop, order_number='2026-001', created_by=user)
        Product.objects.bulk_create(Product(shop=other, name=f'O{i}') for i in range(9))
        Customer.objects.bulk_create(
            Customer(shop=other, name=f'O{i}') for i in range(9)
        )
        Order.objects.create(shop=other, order_number='2026-001', created_by=other_user)

        client = APIClient()
        client.force_authenticate(user=user)
        usage = client.get('/api/subscriptions/current/').data['usage']
        self.assertEqual(
            usage,
            {
                'products': {'count': 3, 'limit': 30},
                'orders_this_month': {'count': 1, 'limit': 15},
                'customers': {'count': 1, 'limit': 15},
                'members': {'count': 1, 'limit': 1},
            },
        )

    def test_unlimited_is_null(self) -> None:
        user, _ = make_shop('usage-plus@example.com', COMMERCE_PLUS)
        client = APIClient()
        client.force_authenticate(user=user)
        usage = client.get('/api/subscriptions/current/').data['usage']
        self.assertEqual(
            {key: value['limit'] for key, value in usage.items()},
            {
                'products': None,
                'orders_this_month': None,
                'customers': None,
                'members': None,
            },
        )


class AiReadsUsageTest(TestCase):
    """Lectures avancées dans GET /subscriptions/current/ : du mois, de la
    boutique seule, face au plafond de sa formule effective (pas Découverte)."""

    def _current(self, user: User) -> dict:
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get('/api/subscriptions/current/').data

    @override_settings(PRODUCT_SCAN_AI_ENABLED=True)
    def test_counts_this_month_of_the_shop_only(self) -> None:
        user, shop = make_shop('ai-reads@example.com', SOLO)
        _, other = make_shop('ai-reads-other@example.com', SOLO)
        month = scan_quota_month(shop)
        ProductScanUsage.objects.create(shop=shop, month=month, text_count=7)
        previous = (month - timedelta(days=1)).replace(day=1)
        ProductScanUsage.objects.create(shop=shop, month=previous, text_count=30)
        ProductScanUsage.objects.create(shop=other, month=month, text_count=29)

        data = self._current(user)
        self.assertIs(data['ai_reads_enabled'], True)
        self.assertEqual(data['ai_reads'], {'count': 7, 'limit': 30})
        self.assertNotIn('ai_reads', data['usage'])

    @override_settings(PRODUCT_SCAN_AI_ENABLED=True)
    def test_no_scan_yet_and_trial_counts_as_boutique(self) -> None:
        user = User.objects.create_user(email='ai-trial@example.com', password='StrongPass123!')  # noqa: E501
        shop = Shop.objects.create(name='Essai', currency='EUR', country='FR')
        ShopMember.objects.create(shop=shop, user=user, role=ShopMember.ROLE_OWNER)
        start_trial_or_default(shop=shop, user=user)
        self.assertEqual(self._current(user)['ai_reads'], {'count': 0, 'limit': 60})

    @override_settings(PRODUCT_SCAN_AI_ENABLED=False)
    def test_hidden_when_no_provider(self) -> None:
        user, shop = make_shop('ai-off@example.com', SOLO)
        ProductScanUsage.objects.create(shop=shop, month=scan_quota_month(shop), text_count=3)  # noqa: E501
        data = self._current(user)
        self.assertIs(data['ai_reads_enabled'], False)
        self.assertIsNone(data['ai_reads'])

    def test_plans_expose_the_monthly_cap(self) -> None:
        user, _ = make_shop('ai-plans@example.com', FREE)
        client = APIClient()
        client.force_authenticate(user=user)
        plans = client.get('/api/subscriptions/plans/').data
        rows = plans['results'] if isinstance(plans, dict) else plans
        self.assertEqual(
            {plan['code']: plan['max_text_scans_per_month'] for plan in rows},
            {FREE: 10, SOLO: 30, BOUTIQUE: 60, COMMERCE_PLUS: 130},
        )


class LimitMultiTenantTest(TestCase):
    """Les compteurs d'une boutique ignorent les objets d'une autre boutique."""

    def test_other_shop_objects_do_not_count(self) -> None:
        user, shop = make_shop('tenant-a@example.com', FREE)
        other_user, other = make_shop('tenant-b@example.com', FREE)
        Product.objects.bulk_create(
            Product(shop=other, name=f'P{i}') for i in range(30)
        )
        Customer.objects.bulk_create(
            Customer(shop=other, name=f'C{i}') for i in range(15)
        )
        Order.objects.bulk_create(
            Order(shop=other, order_number=f'2026-{i:03d}', created_by=other_user)
            for i in range(15)
        )
        add_staff(other, 2)

        with transaction.atomic():
            limits.enforce_product_limit(shop)
            limits.enforce_customer_limit(shop)
            limits.enforce_orders_per_month_limit(shop)
        attach_subscription(shop, plan_code=BOUTIQUE)
        attach_subscription(other, plan_code=BOUTIQUE)
        add_staff(
            other, 1
        )  # l'autre boutique est pleine (4) ; celle-ci n'a qu'un membre.
        with transaction.atomic():
            limits.enforce_member_limit(Shop.objects.get(pk=shop.pk))

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post('/api/customers/', {'name': 'Premier'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class LimitConcurrencyTest(TransactionTestCase):
    """Deux créations simultanées sur le dernier slot : une seule passe.

    `_check` est ralenti pour élargir la fenêtre entre le comptage et la création :
    sans le verrou de la boutique, les deux threads compteraient `limite - 1` et
    créeraient tous deux leur objet.
    """

    serialized_rollback = True

    def _race(self, create: Callable[[], object]) -> list[BaseException | None]:
        barrier = threading.Barrier(2)
        results: list[BaseException | None] = []
        original_check = limits._check

        def slow_check(*args, **kwargs) -> None:
            original_check(*args, **kwargs)
            time.sleep(0.3)

        def worker() -> None:
            try:
                barrier.wait()
                create()
                results.append(None)
            except BaseException as exc:  # noqa: BLE001 — on compare les issues.
                results.append(exc)
            finally:
                connection.close()

        with mock.patch.object(limits, '_check', slow_check):
            threads = [threading.Thread(target=worker) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
        return results

    def _assert_one_winner(self, results: list[BaseException | None]) -> None:
        self.assertEqual(len(results), 2)
        self.assertEqual(results.count(None), 1, results)
        loser = next(r for r in results if r is not None)
        self.assertIsInstance(loser, ValidationError)
        self.assertEqual(loser.detail['code'], 'plan_limit_exceeded')

    def test_products(self) -> None:
        from apps.products.services import create_product

        user, shop = make_shop('race-products@example.com', FREE)
        Product.objects.bulk_create(Product(shop=shop, name=f'P{i}') for i in range(29))
        results = self._race(
            lambda: create_product(
                Shop.objects.get(pk=shop.pk),
                user,
                {'name': 'Course'},
            )
        )
        self._assert_one_winner(results)
        self.assertEqual(Product.objects.filter(shop=shop, is_active=True).count(), 30)

    def test_orders_per_month(self) -> None:
        from apps.orders.services import create_order

        user, shop = make_shop('race-orders@example.com', FREE)
        Order.objects.bulk_create(
            Order(shop=shop, order_number=f'2025-{i:03d}', created_by=user)
            for i in range(14)
        )
        results = self._race(lambda: create_order(Shop.objects.get(pk=shop.pk), user))
        self._assert_one_winner(results)
        self.assertEqual(Order.objects.filter(shop=shop).count(), 15)

    def test_customers(self) -> None:
        user, shop = make_shop('race-customers@example.com', FREE)
        Customer.objects.bulk_create(
            Customer(shop=shop, name=f'C{i}') for i in range(14)
        )

        def create() -> None:
            client = APIClient()
            client.force_authenticate(user=user)
            response = client.post('/api/customers/', {'name': 'Course'}, format='json')
            if response.status_code != status.HTTP_201_CREATED:
                raise ValidationError(response.data)

        results = self._race(create)
        self._assert_one_winner(results)
        self.assertEqual(Customer.objects.filter(shop=shop).count(), 15)

    def test_members(self) -> None:
        from apps.shops.services import create_staff_member

        _, shop = make_shop('race-members@example.com', BOUTIQUE)
        add_staff(shop, 2)
        emails = iter(['course-1@example.com', 'course-2@example.com'])
        lock = threading.Lock()

        def create() -> None:
            with lock:
                email = next(emails)
            create_staff_member(
                shop=Shop.objects.get(pk=shop.pk),
                email=email,
                full_name='Course',
                phone='',
                password='StrongPass123!',
                permissions=[],
            )

        results = self._race(create)
        self._assert_one_winner(results)
        self.assertEqual(ShopMember.objects.filter(shop=shop).count(), 4)

    def test_product_reactivation(self) -> None:
        """Deux réactivations simultanées sur le dernier slot : une seule passe."""
        from apps.products.services import reactivate_product

        _, shop = make_shop('race-reactivate@example.com', FREE)
        Product.objects.bulk_create(Product(shop=shop, name=f'P{i}') for i in range(29))
        archived = iter(
            Product.objects.bulk_create(
                Product(shop=shop, name=f'A{i}', is_active=False) for i in range(2)
            )
        )
        lock = threading.Lock()

        def reactivate() -> None:
            with lock:
                product = next(archived)
            reactivate_product(Product.objects.get(pk=product.pk))

        results = self._race(reactivate)
        self._assert_one_winner(results)
        self.assertEqual(Product.objects.filter(shop=shop, is_active=True).count(), 30)

    def test_customer_reactivation(self) -> None:
        user, shop = make_shop('race-reactivate-c@example.com', FREE)
        Customer.objects.bulk_create(
            Customer(shop=shop, name=f'C{i}') for i in range(14)
        )
        inactive = iter(
            Customer.objects.bulk_create(
                Customer(shop=shop, name=f'I{i}', is_active=False) for i in range(2)
            )
        )
        lock = threading.Lock()

        def reactivate() -> None:
            with lock:
                customer = next(inactive)
            client = APIClient()
            client.force_authenticate(user=user)
            response = client.patch(
                f'/api/customers/{customer.pk}/', {'is_active': True}, format='json'
            )
            if response.status_code != status.HTTP_200_OK:
                raise ValidationError(response.data)

        results = self._race(reactivate)
        self._assert_one_winner(results)
        self.assertEqual(Customer.objects.filter(shop=shop, is_active=True).count(), 15)


class RenamePlansMigrationTest(TestCase):
    """`0004_rename_plans` : codes renommés en place, souscriptions conservées."""

    migration = importlib.import_module(
        'apps.subscriptions.migrations.0004_rename_plans'
    )

    def setUp(self) -> None:
        # Rejoue l'état d'avant la migration sur les mêmes lignes.
        self.migration.backwards(django_apps, None)
        self.pro = SubscriptionPlan.objects.get(code='pro')
        self.boutique_plus = SubscriptionPlan.objects.get(code='boutique_plus')

    def _subscribe(self, plan: SubscriptionPlan, email: str) -> Subscription:
        shop = Shop.objects.create(name=email, currency='EUR')
        return Subscription.objects.create(
            shop=shop,
            plan=plan,
            status=Subscription.STATUS_ACTIVE,
            current_period_start=timezone.now(),
        )

    def test_backwards_restores_legacy_grid(self) -> None:
        self.assertEqual(
            set(SubscriptionPlan.objects.values_list('code', flat=True)),
            {'free', 'pro', 'boutique_plus'},
        )
        free = SubscriptionPlan.objects.get(code='free')
        self.assertEqual(
            (free.name, free.max_products, free.max_customers), ('Gratuit', 50, None)
        )

    def test_forwards_renames_in_place_and_keeps_subscriptions(self) -> None:
        pro_sub = self._subscribe(self.pro, 'pro-shop')
        plus_sub = self._subscribe(self.boutique_plus, 'plus-shop')

        self.migration.forwards(django_apps, None)

        solo = SubscriptionPlan.objects.get(code=SOLO)
        boutique = SubscriptionPlan.objects.get(code=BOUTIQUE)
        self.assertEqual(solo.pk, self.pro.pk)
        self.assertEqual(boutique.pk, self.boutique_plus.pk)
        self.assertEqual((solo.name, boutique.name), ('Solo', 'Boutique'))
        pro_sub.refresh_from_db()
        plus_sub.refresh_from_db()
        self.assertEqual(pro_sub.plan.code, SOLO)
        self.assertEqual(plus_sub.plan.code, BOUTIQUE)
        self.assertFalse(
            SubscriptionPlan.objects.filter(code__in=['pro', 'boutique_plus']).exists()
        )
        self.assertTrue(SubscriptionPlan.objects.filter(code=COMMERCE_PLUS).exists())

    def test_forwards_is_idempotent(self) -> None:
        self.migration.forwards(django_apps, None)
        self.migration.forwards(django_apps, None)
        self.assertEqual(SubscriptionPlan.objects.count(), 4)
