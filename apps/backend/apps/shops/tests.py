from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember


def make_user_with_shop(email, password='Pass123!Strong'):
    user = User.objects.create_user(email=email, password=password)
    shop = Shop.objects.create(name=f'Shop de {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


class ShopDetailViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = make_user_with_shop('owner@example.com')
        self.other_user, self.other_shop = make_user_with_shop('other@example.com')

    def test_get_own_shop(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse('shop-detail'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(self.shop.id))

    def test_update_shop_name(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(reverse('shop-detail'), {'name': 'Nouveau nom'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.name, 'Nouveau nom')

    def test_unauthenticated_denied(self):
        response = self.client.get(reverse('shop-detail'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class MultiTenantIsolationTest(TestCase):
    """Un utilisateur ne peut voir ou modifier que sa propre boutique."""

    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a = make_user_with_shop('a@example.com')
        self.user_b, self.shop_b = make_user_with_shop('b@example.com')

    def test_user_a_sees_own_shop_not_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('shop-detail'))
        self.assertEqual(response.data['id'], str(self.shop_a.id))
        self.assertNotEqual(response.data['id'], str(self.shop_b.id))

    def test_user_a_members_only_own_shop(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('shop-members'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        member_ids = [str(m['user']) for m in response.data['results']]
        self.assertIn(str(self.user_a.id), member_ids)
        self.assertNotIn(str(self.user_b.id), member_ids)


class OnboardingViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner, self.shop = make_user_with_shop('owner@example.com')
        self.staff = User.objects.create_user(email='staff@example.com', password='Pass123!Strong')
        ShopMember.objects.create(shop=self.shop, user=self.staff, role='staff')
        self.url = reverse('shop-onboarding')

    def test_owner_can_complete_onboarding(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.url, {
            'catalog_kind': 'services',
            'dashboard_mode': 'minimal',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.catalog_kind, 'services')
        self.assertEqual(self.shop.dashboard_mode, 'minimal')
        self.assertIsNotNone(self.shop.onboarding_completed_at)

    def test_staff_forbidden(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(self.url, {
            'catalog_kind': 'products',
            'dashboard_mode': 'complete',
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_choice_rejected(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.url, {
            'catalog_kind': 'invalid',
            'dashboard_mode': 'complete',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_second_call_keeps_initial_completion_date(self):
        self.client.force_authenticate(user=self.owner)
        self.client.post(self.url, {'catalog_kind': 'products', 'dashboard_mode': 'minimal'})
        self.shop.refresh_from_db()
        first_completion = self.shop.onboarding_completed_at

        response = self.client.post(self.url, {'catalog_kind': 'both', 'dashboard_mode': 'complete'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.shop.refresh_from_db()
        # Préférences mises à jour, mais date d'origine préservée — utile si
        # on veut un jour mesurer "combien de temps après création le wizard a été fait".
        self.assertEqual(self.shop.catalog_kind, 'both')
        self.assertEqual(self.shop.dashboard_mode, 'complete')
        self.assertEqual(self.shop.onboarding_completed_at, first_completion)
