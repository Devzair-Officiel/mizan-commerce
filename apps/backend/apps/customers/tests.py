from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from .models import Customer


def setup(email):
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


class CustomerCRUDTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('seller@example.com')
        self.client.force_authenticate(user=self.user)

    def test_create_customer(self):
        response = self.client.post(reverse('customer-list'), {'name': 'Mohammed Ali', 'phone': '+33600000000'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_list_active_only_by_default(self):
        Customer.objects.create(shop=self.shop, name='Actif')
        Customer.objects.create(shop=self.shop, name='Inactif', is_active=False)
        response = self.client.get(reverse('customer-list'))
        names = [c['name'] for c in response.data['results']]
        self.assertIn('Actif', names)
        self.assertNotIn('Inactif', names)

    def test_soft_delete(self):
        c = Customer.objects.create(shop=self.shop, name='À archiver')
        response = self.client.delete(reverse('customer-detail', kwargs={'pk': c.pk}))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        c.refresh_from_db()
        self.assertFalse(c.is_active)

    def test_search_by_name(self):
        Customer.objects.create(shop=self.shop, name='Youssef')
        Customer.objects.create(shop=self.shop, name='Fatima')
        response = self.client.get(reverse('customer-list') + '?search=yous')
        names = [c['name'] for c in response.data['results']]
        self.assertIn('Youssef', names)
        self.assertNotIn('Fatima', names)


class CustomerMultiTenantTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a = setup('a@example.com')
        self.user_b, self.shop_b = setup('b@example.com')
        self.customer_b = Customer.objects.create(shop=self.shop_b, name='Client B')

    def test_user_a_cannot_access_customer_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('customer-detail', kwargs={'pk': self.customer_b.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
