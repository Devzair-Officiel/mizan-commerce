"""Tests de la couche abonnement.

Couvre :
- URS-100 : trial 14j Boutique+ au premier shop, gratuit aux suivants.
- Services : `start_trial_or_default`, `downgrade_to_free`, `expire_trial`.
- Endpoints : GET /current/, POST /change/.
- Property `Shop.effective_plan` (le cœur du gating frontend).
"""

from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.services import (
    downgrade_to_free,
    expire_trial,
    start_trial_or_default,
)


def _make_user(email: str = 'owner@example.com') -> User:
    return User.objects.create_user(email=email, password='StrongPass123!', full_name='Owner')


def _make_shop(name: str = 'Shop 1') -> Shop:
    return Shop.objects.create(name=name, currency='EUR')


def _make_owner(user: User, shop: Shop) -> ShopMember:
    return ShopMember.objects.create(user=user, shop=shop, role='owner')


class StartTrialServiceTest(TestCase):
    """URS-100 — première souscription d'un user → trial 14j Boutique+."""

    def test_first_shop_starts_on_boutique_plus_trial(self):
        user = _make_user()
        shop = _make_shop()
        sub = start_trial_or_default(shop=shop, user=user)

        self.assertEqual(sub.plan.code, SubscriptionPlan.CODE_BOUTIQUE_PLUS)
        self.assertEqual(sub.status, Subscription.STATUS_TRIALING)
        self.assertIsNotNone(sub.current_period_end)
        delta = sub.current_period_end - sub.current_period_start
        self.assertEqual(delta.days, 14)

        user.refresh_from_db()
        self.assertIsNotNone(user.trial_consumed_at)

    def test_second_shop_for_same_user_starts_on_free(self):
        user = _make_user()
        shop1 = _make_shop('Shop A')
        start_trial_or_default(shop=shop1, user=user)

        shop2 = _make_shop('Shop B')
        sub2 = start_trial_or_default(shop=shop2, user=user)

        self.assertEqual(sub2.plan.code, SubscriptionPlan.CODE_FREE)
        self.assertEqual(sub2.status, Subscription.STATUS_ACTIVE)
        self.assertIsNone(sub2.current_period_end)

    def test_idempotent_on_existing_subscription(self):
        user = _make_user()
        shop = _make_shop()
        first = start_trial_or_default(shop=shop, user=user)
        again = start_trial_or_default(shop=shop, user=user)
        self.assertEqual(first.id, again.id)
        self.assertEqual(Subscription.objects.filter(shop=shop).count(), 1)


class ExpireTrialServiceTest(TestCase):
    def test_trialing_subscription_is_switched_to_free_active(self):
        user = _make_user()
        shop = _make_shop()
        sub = start_trial_or_default(shop=shop, user=user)
        sub.current_period_end = timezone.now() - timedelta(hours=1)
        sub.save(update_fields=['current_period_end'])

        expire_trial(sub)
        sub.refresh_from_db()
        self.assertEqual(sub.plan.code, SubscriptionPlan.CODE_FREE)
        self.assertEqual(sub.status, Subscription.STATUS_ACTIVE)

    def test_non_trialing_subscription_is_noop(self):
        # User dont l'essai est déjà consommé → second shop directement sur Gratuit.
        user = _make_user()
        user.trial_consumed_at = timezone.now()
        user.save(update_fields=['trial_consumed_at'])

        shop = _make_shop()
        free_sub = start_trial_or_default(shop=shop, user=user)
        self.assertEqual(free_sub.plan.code, SubscriptionPlan.CODE_FREE)

        expire_trial(free_sub)
        free_sub.refresh_from_db()
        self.assertEqual(free_sub.plan.code, SubscriptionPlan.CODE_FREE)
        self.assertEqual(free_sub.status, Subscription.STATUS_ACTIVE)


class DowngradeToFreeServiceTest(TestCase):
    def test_trial_downgrades_to_free(self):
        user = _make_user()
        shop = _make_shop()
        sub = start_trial_or_default(shop=shop, user=user)
        downgrade_to_free(sub)
        sub.refresh_from_db()
        self.assertEqual(sub.plan.code, SubscriptionPlan.CODE_FREE)
        self.assertEqual(sub.status, Subscription.STATUS_ACTIVE)
        self.assertIsNotNone(sub.cancelled_at)
        self.assertIsNone(sub.current_period_end)

    def test_idempotent_on_already_free(self):
        user = _make_user()
        shop = _make_shop()
        sub = start_trial_or_default(shop=shop, user=user)
        downgrade_to_free(sub)
        sub.refresh_from_db()
        cancelled_first = sub.cancelled_at
        downgrade_to_free(sub)
        sub.refresh_from_db()
        # cancelled_at ne doit pas être réécrit sur le second appel.
        self.assertEqual(sub.cancelled_at, cancelled_first)


class ShopEffectivePlanTest(TestCase):
    """`Shop.effective_plan` = la source de vérité pour le gating."""

    def test_active_trial_returns_boutique_plus(self):
        user = _make_user()
        shop = _make_shop()
        start_trial_or_default(shop=shop, user=user)
        self.assertEqual(shop.effective_plan.code, SubscriptionPlan.CODE_BOUTIQUE_PLUS)

    def test_expired_trial_returns_free_even_before_celery_runs(self):
        user = _make_user()
        shop = _make_shop()
        sub = start_trial_or_default(shop=shop, user=user)
        sub.current_period_end = timezone.now() - timedelta(hours=1)
        sub.save(update_fields=['current_period_end'])
        # Pas d'appel à expire_trial — on vérifie la sécurité paresseuse.
        self.assertEqual(shop.effective_plan.code, SubscriptionPlan.CODE_FREE)

    def test_shop_without_subscription_returns_free(self):
        shop = _make_shop()
        self.assertEqual(shop.effective_plan.code, SubscriptionPlan.CODE_FREE)


class SubscriptionCurrentEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('subscription-current')
        self.user = _make_user()
        self.shop = _make_shop()
        _make_owner(self.user, self.shop)
        start_trial_or_default(shop=self.shop, user=self.user)

    def test_requires_auth(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_subscription_with_effective_plan(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], Subscription.STATUS_TRIALING)
        self.assertEqual(response.data['plan']['code'], SubscriptionPlan.CODE_BOUTIQUE_PLUS)
        self.assertEqual(response.data['effective_plan_code'], SubscriptionPlan.CODE_BOUTIQUE_PLUS)
        self.assertIsNotNone(response.data['days_remaining'])


class SubscriptionChangeEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('subscription-change')
        self.user = _make_user()
        self.shop = _make_shop()
        _make_owner(self.user, self.shop)
        start_trial_or_default(shop=self.shop, user=self.user)

    def test_owner_can_downgrade_to_free(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {'plan_code': SubscriptionPlan.CODE_FREE})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['plan']['code'], SubscriptionPlan.CODE_FREE)
        self.assertEqual(response.data['effective_plan_code'], SubscriptionPlan.CODE_FREE)

    def test_upgrade_to_pro_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {'plan_code': SubscriptionPlan.CODE_PRO})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_staff_cannot_downgrade(self):
        staff_user = _make_user('staff@example.com')
        ShopMember.objects.create(user=staff_user, shop=self.shop, role='staff')
        self.client.force_authenticate(user=staff_user)
        response = self.client.post(self.url, {'plan_code': SubscriptionPlan.CODE_FREE})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PlanGatingTest(TestCase):
    """RBAC commercial : un endpoint gaté retourne 403 si la formule n'est pas souscrite.

    Le but n'est pas de re-tester chaque vue (couverte par les tests des apps),
    mais de vérifier que `HasPlanForFeature` est bien câblé sur au moins un
    endpoint de chaque tier (pro, boutique+). On utilise GET /api/orders/ (pro)
    et GET /api/public-page/ (boutique+) comme sondes.
    """

    def _setup_member(self, plan_code: str, status: str = Subscription.STATUS_ACTIVE) -> User:
        user = _make_user(f'{plan_code}@example.com')
        shop = _make_shop(f'Shop {plan_code}')
        _make_owner(user, shop)
        plan = SubscriptionPlan.objects.get(code=plan_code)
        Subscription.objects.create(
            shop=shop, plan=plan, status=status,
            current_period_start=timezone.now(),
            current_period_end=(
                timezone.now() + timedelta(days=14)
                if status == Subscription.STATUS_TRIALING else None
            ),
        )
        return user

    def test_free_plan_blocks_orders_endpoint(self):
        user = self._setup_member(SubscriptionPlan.CODE_FREE)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/orders/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pro_plan_allows_orders_endpoint(self):
        user = self._setup_member(SubscriptionPlan.CODE_PRO)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pro_plan_blocks_public_page_endpoint(self):
        user = self._setup_member(SubscriptionPlan.CODE_PRO)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/public-page/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_boutique_plus_trial_allows_public_page_endpoint(self):
        user = self._setup_member(
            SubscriptionPlan.CODE_BOUTIQUE_PLUS,
            status=Subscription.STATUS_TRIALING,
        )
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/public-page/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_expired_trial_blocks_pro_features_even_before_celery(self):
        """Sécurité paresseuse : un trial expiré gate avant le run de la tâche."""
        user = self._setup_member(
            SubscriptionPlan.CODE_BOUTIQUE_PLUS,
            status=Subscription.STATUS_TRIALING,
        )
        sub = Subscription.objects.get(shop__members__user=user)
        sub.current_period_end = timezone.now() - timedelta(hours=1)
        sub.save(update_fields=['current_period_end'])

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/orders/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PlanQuantitativeLimitsTest(TestCase):
    """Limites max_products / max_orders_per_month appliquées sur Gratuit."""

    def _setup_free(self):
        user = _make_user('free-limits@example.com')
        shop = _make_shop('Shop Free Limits')
        _make_owner(user, shop)
        free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
        Subscription.objects.create(
            shop=shop, plan=free_plan,
            status=Subscription.STATUS_ACTIVE,
            current_period_start=timezone.now(),
        )
        return user, shop

    def test_product_limit_blocks_creation_when_reached(self):
        from apps.products.models import Product
        from apps.subscriptions.limits import enforce_product_limit

        user, shop = self._setup_free()
        # Gratuit = 50 produits. On bourre le compteur jusqu'à la limite.
        for i in range(50):
            Product.objects.create(shop=shop, name=f'Produit {i}')

        with self.assertRaises(Exception) as ctx:
            enforce_product_limit(shop)
        self.assertIn('plan_limit_exceeded', str(ctx.exception))

    def test_product_limit_ignores_inactive_products(self):
        from apps.products.models import Product
        from apps.subscriptions.limits import enforce_product_limit

        user, shop = self._setup_free()
        # 50 actifs + 5 inactifs : limite atteinte sur les actifs seulement.
        for i in range(50):
            Product.objects.create(shop=shop, name=f'Actif {i}')
        for i in range(5):
            Product.objects.create(shop=shop, name=f'Inactif {i}', is_active=False)

        # Désactive un produit → un slot se libère.
        Product.objects.filter(shop=shop, is_active=True).first().is_active = False
        Product.objects.filter(shop=shop, is_active=True, name='Actif 0').update(is_active=False)
        enforce_product_limit(shop)  # ne doit pas lever.

    def test_orders_per_month_limit_blocks_when_reached(self):
        from apps.orders.models import Order
        from apps.subscriptions.limits import enforce_orders_per_month_limit

        user, shop = self._setup_free()
        # Gratuit = 20 commandes/mois.
        for i in range(20):
            Order.objects.create(
                shop=shop, order_number=f'2026-{i:04d}', created_by=user,
            )

        with self.assertRaises(Exception) as ctx:
            enforce_orders_per_month_limit(shop)
        self.assertIn('plan_limit_exceeded', str(ctx.exception))

    def test_pro_plan_has_no_limit(self):
        from apps.products.models import Product
        from apps.subscriptions.limits import enforce_product_limit

        user = _make_user('pro@example.com')
        shop = _make_shop('Shop Pro')
        _make_owner(user, shop)
        pro_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_PRO)
        Subscription.objects.create(
            shop=shop, plan=pro_plan,
            status=Subscription.STATUS_ACTIVE,
            current_period_start=timezone.now(),
        )
        for i in range(100):
            Product.objects.create(shop=shop, name=f'P{i}')
        enforce_product_limit(shop)  # max_products=NULL → no-op.
