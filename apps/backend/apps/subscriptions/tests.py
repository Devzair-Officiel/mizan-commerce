"""Tests de la couche abonnement.

Couvre :
- URS-100 : trial 14j Boutique au premier shop, Découverte aux suivants.
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
    return User.objects.create_user(email=email, password='StrongPass123!', full_name='Owner')  # noqa: E501


def _make_shop(name: str = 'Shop 1') -> Shop:
    return Shop.objects.create(name=name, currency='EUR')


def _make_owner(user: User, shop: Shop) -> ShopMember:
    return ShopMember.objects.create(user=user, shop=shop, role='owner')


class StartTrialServiceTest(TestCase):
    """URS-100 — première souscription d'un user → trial 14j Boutique."""

    def test_first_shop_starts_on_boutique_trial(self):
        user = _make_user()
        shop = _make_shop()
        sub = start_trial_or_default(shop=shop, user=user)

        self.assertEqual(sub.plan.code, SubscriptionPlan.CODE_BOUTIQUE)
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
        # User dont l'essai est déjà consommé → second shop directement sur Découverte.
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

    def test_active_trial_returns_boutique(self):
        user = _make_user()
        shop = _make_shop()
        start_trial_or_default(shop=shop, user=user)
        self.assertEqual(shop.effective_plan.code, SubscriptionPlan.CODE_BOUTIQUE)

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
        self.assertEqual(response.data['plan']['code'], SubscriptionPlan.CODE_BOUTIQUE)  # noqa: E501
        self.assertEqual(response.data['effective_plan_code'], SubscriptionPlan.CODE_BOUTIQUE)  # noqa: E501
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
        self.assertEqual(response.data['effective_plan_code'], SubscriptionPlan.CODE_FREE)  # noqa: E501

    def test_upgrade_to_pro_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {'plan_code': SubscriptionPlan.CODE_SOLO})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_paid_plan_without_payment(self):
        # Seule la résiliation passe : aucune formule payante, même celle de l'essai,
        # ne s'obtient par cet endpoint, et la souscription reste intacte.
        self.client.force_authenticate(user=self.user)
        before = Subscription.objects.get(shop=self.shop)
        paid = SubscriptionPlan.TIER_ORDER[1:]
        for code in [*paid, 'enterprise', '']:
            with self.subTest(code=code):
                response = self.client.post(
                    self.url, {'plan_code': code, 'status': Subscription.STATUS_ACTIVE},
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                after = Subscription.objects.get(shop=self.shop)
                self.assertEqual(
                    (after.plan_id, after.status, after.current_period_end),
                    (before.plan_id, before.status, before.current_period_end),
                )

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
    endpoint de chaque palier (Solo, Boutique). On utilise GET /api/invoices/ (Solo)
    et GET /api/public-page/ (Boutique) comme sondes. La matrice complète par
    formule est dans `test_plans.py`.
    """  # noqa: E501

    def _setup_member(self, plan_code: str, status: str = Subscription.STATUS_ACTIVE) -> User:  # noqa: E501
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

    def test_free_plan_blocks_invoices_endpoint(self):
        user = self._setup_member(SubscriptionPlan.CODE_FREE)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/invoices/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_solo_plan_allows_invoices_endpoint(self):
        user = self._setup_member(SubscriptionPlan.CODE_SOLO)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/invoices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_solo_plan_blocks_public_page_endpoint(self):
        user = self._setup_member(SubscriptionPlan.CODE_SOLO)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/public-page/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_boutique_trial_allows_public_page_endpoint(self):
        user = self._setup_member(
            SubscriptionPlan.CODE_BOUTIQUE,
            status=Subscription.STATUS_TRIALING,
        )
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/public-page/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_expired_trial_blocks_paid_features_even_before_celery(self):
        """Sécurité paresseuse : un trial expiré gate avant le run de la tâche."""
        user = self._setup_member(
            SubscriptionPlan.CODE_BOUTIQUE,
            status=Subscription.STATUS_TRIALING,
        )
        sub = Subscription.objects.get(shop__members__user=user)
        sub.current_period_end = timezone.now() - timedelta(hours=1)
        sub.save(update_fields=['current_period_end'])

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/invoices/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
