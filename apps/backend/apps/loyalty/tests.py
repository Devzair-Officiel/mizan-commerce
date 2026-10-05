from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.shops.models import Shop, ShopMember
from .models import LoyaltyCard, LoyaltyProgram


def setup(email: str) -> tuple[User, Shop]:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


class LoyaltyProgramTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('owner@loyalty.com')
        self.client.force_authenticate(user=self.user)

    def test_get_program_auto_creates(self):
        response = self.client.get(reverse('loyalty-program'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.assertTrue(LoyaltyProgram.objects.filter(shop=self.shop).exists())

    def test_patch_program(self):
        response = self.client.patch(
            reverse('loyalty-program'),
            {'is_active': True, 'points_per_unit': 2},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_active'])
        self.assertEqual(response.data['points_per_unit'], 2)


class LoyaltyCardTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('owner2@loyalty.com')
        self.client.force_authenticate(user=self.user)
        self.customer = Customer.objects.create(shop=self.shop, name='Fatima Lahlou')
        self.card = LoyaltyCard.objects.create(shop=self.shop, customer=self.customer)

    def test_list_cards(self):
        response = self.client.get(reverse('loyalty-card-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)

    def test_earn_points(self):
        response = self.client.post(
            reverse('loyalty-card-earn', kwargs={'pk': self.card.pk}),
            {'points': 50},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['points_balance'], 50)

    def test_redeem_points(self):
        self.card.points_balance = 100
        self.card.total_points_earned = 100
        self.card.save()
        response = self.client.post(
            reverse('loyalty-card-redeem', kwargs={'pk': self.card.pk}),
            {'points': 30},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['points_balance'], 70)

    def test_redeem_insufficient_balance(self):
        response = self.client.post(
            reverse('loyalty-card-redeem', kwargs={'pk': self.card.pk}),
            {'points': 999},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_adjust_positive(self):
        self.card.points_balance = 50
        self.card.save()
        response = self.client.post(
            reverse('loyalty-card-adjust', kwargs={'pk': self.card.pk}),
            {'delta': 10, 'note': 'Geste commercial'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['points_balance'], 60)

    def test_adjust_negative(self):
        self.card.points_balance = 50
        self.card.save()
        response = self.client.post(
            reverse('loyalty-card-adjust', kwargs={'pk': self.card.pk}),
            {'delta': -20, 'note': 'Correction manuelle'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['points_balance'], 30)

    def test_adjust_negative_balance_rejected(self):
        response = self.client.post(
            reverse('loyalty-card-adjust', kwargs={'pk': self.card.pk}),
            {'delta': -999, 'note': 'Erreur'},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_transactions_list(self):
        self.client.post(reverse('loyalty-card-earn', kwargs={'pk': self.card.pk}), {'points': 10})  # noqa: E501
        response = self.client.get(reverse('loyalty-card-transactions', kwargs={'pk': self.card.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)


class LoyaltyMultiTenantTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a = setup('a@loyalty.com')
        self.user_b, self.shop_b = setup('b@loyalty.com')
        customer_b = Customer.objects.create(shop=self.shop_b, name='Client B')
        self.card_b = LoyaltyCard.objects.create(shop=self.shop_b, customer=customer_b)

    def test_user_a_cannot_see_card_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('loyalty-card-detail', kwargs={'pk': self.card_b.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_earn_on_card_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            reverse('loyalty-card-earn', kwargs={'pk': self.card_b.pk}),
            {'points': 10},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
