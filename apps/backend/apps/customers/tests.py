from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.orders.models import Order
from .models import Customer
from .services import build_customers_summary


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
        response = self.client.post(reverse('customer-list'), {'name': 'Mohammed Ali', 'phone': '+33600000000'})  # noqa: E501
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
        response = self.client.get(reverse('customer-detail', kwargs={'pk': self.customer_b.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CustomerListServerSideTest(TestCase):
    """Situation, tri, indicateurs et facettes calculés côté serveur (URS-031)."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('list@example.com')
        self.client.force_authenticate(user=self.user)
        now = timezone.now()
        # Ali : 2 commandes dont une impayée (reste 30), plus une annulée ignorée.
        self.ali = Customer.objects.create(shop=self.shop, name='Ali', city='Lyon')
        self._order(self.ali, '100', '100', 'paid', days_ago=10)
        self._order(self.ali, '50', '20', 'partial', days_ago=2)
        self._order(self.ali, '999', '0', 'unpaid', days_ago=1, status_='cancelled')
        # Béa : une commande payée, plus ancienne.
        self.bea = Customer.objects.create(shop=self.shop, name='Béa')
        self._order(self.bea, '300', '300', 'paid', days_ago=20)
        # Chloé : sans commande. Driss : désactivé avec un impayé.
        self.chloe = Customer.objects.create(shop=self.shop, name='Chloé')
        self.driss = Customer.objects.create(
            shop=self.shop, name='Driss', is_active=False,
        )
        self._order(self.driss, '40', '0', 'unpaid', days_ago=5)
        # Emma : créée le mois dernier, sans commande.
        self.emma = Customer.objects.create(shop=self.shop, name='Emma')
        Customer.objects.filter(pk=self.emma.pk).update(
            created_at=now - timedelta(days=40),
        )
        # Une autre boutique, jamais visible.
        _, other = setup('other@example.com')
        intruder = Customer.objects.create(shop=other, name='Intrus')
        self._order(intruder, '500', '0', 'unpaid', days_ago=1, shop=other)

    def _order(self, customer, total, paid, payment, *, days_ago, status_='shipped', shop=None):  # noqa: E501
        order = Order.objects.create(
            shop=shop or self.shop, customer=customer, order_number=f'N-{Order.objects.count()}',  # noqa: E501
            status=status_, payment_status=payment,
            total_amount=Decimal(total), amount_paid=Decimal(paid),
        )
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(days=days_ago))  # noqa: E501
        return order

    def _names(self, **params):
        response = self.client.get(reverse('customer-list'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [c['name'] for c in response.data['results']]

    def test_situations(self):
        self.assertEqual(self._names(situation='all'), ['Ali', 'Béa', 'Chloé', 'Driss', 'Emma'])  # noqa: E501
        self.assertEqual(
            self._names(situation='active'), ['Ali', 'Béa', 'Chloé', 'Emma'],
        )
        self.assertEqual(self._names(), ['Ali', 'Béa', 'Chloé', 'Emma'])
        self.assertEqual(self._names(situation='pending'), ['Ali', 'Driss'])
        self.assertEqual(self._names(situation='deactivated'), ['Driss'])

    def test_period_month(self):
        self.assertNotIn('Emma', self._names(situation='all', period='month'))

    def test_list_fields(self):
        response = self.client.get(reverse('customer-list'), {'search': 'Ali'})
        ali = response.data['results'][0]
        self.assertEqual(ali['order_count'], 2)
        self.assertEqual(ali['pending_amount'], '30.00')
        self.assertEqual(ali['paid_amount'], '120.00')
        self.assertIsNotNone(ali['last_order_at'])
        chloe = self.client.get(reverse('customer-list'), {'search': 'Chlo'}).data['results'][0]  # noqa: E501
        self.assertEqual((chloe['order_count'], chloe['pending_amount'], chloe['last_order_at']), (0, '0.00', None))  # noqa: E501

    def test_ordering_name_and_created_at(self):
        self.assertEqual(self._names(situation='all', ordering='-name'), ['Emma', 'Driss', 'Chloé', 'Béa', 'Ali'])  # noqa: E501
        self.assertEqual(self._names(situation='all', ordering='created_at')[0], 'Emma')
        names = self._names(situation='all', ordering='-created_at')
        self.assertEqual(names[-1], 'Emma')

    def test_order_derived_orderings_put_customers_without_orders_last(self):
        expected = {
            'pending_amount': ['Béa', 'Ali', 'Driss'],
            '-pending_amount': ['Driss', 'Ali', 'Béa'],
            'paid_amount': ['Driss', 'Ali', 'Béa'],
            '-paid_amount': ['Béa', 'Ali', 'Driss'],
            'order_count': ['Béa', 'Driss', 'Ali'],
            '-order_count': ['Ali', 'Béa', 'Driss'],
            'last_order_at': ['Béa', 'Driss', 'Ali'],
            '-last_order_at': ['Ali', 'Driss', 'Béa'],
        }
        for ordering, with_orders in expected.items():
            with self.subTest(ordering=ordering):
                self.assertEqual(self._names(situation='all', ordering=ordering), with_orders + ['Chloé', 'Emma'])  # noqa: E501

    def test_summary(self):
        data = self.client.get(reverse('customer-summary')).data
        self.assertEqual(data['active'], {'count': 4})
        self.assertEqual(data['due'], {'count': 2, 'amount': '70.00'})
        self.assertEqual(data['new_this_month'], {'count': 4})

    def test_summary_new_this_month_uses_shop_timezone(self):
        # 31 mars 23 h 30 UTC = 1er avril 1 h 30 à Paris : client d'avril.
        Customer.objects.filter(shop=self.shop).update(created_at=datetime(2026, 3, 31, 23, 30, tzinfo=dt_timezone.utc))  # noqa: E501
        now = datetime(2026, 4, 15, 12, 0, tzinfo=dt_timezone.utc)
        self.assertEqual(build_customers_summary(self.shop, now)['new_this_month']['count'], 5)  # noqa: E501

    def test_facets_match_list(self):
        for params in ({}, {'search': 'a'}, {'period': 'month'}):
            response = self.client.get(reverse('customer-facets'), params)
            facets = response.data['situation']
            for situation in ('all', 'active', 'pending', 'deactivated'):
                with self.subTest(params=params, situation=situation):
                    response = self.client.get(reverse('customer-list'), {**params, 'situation': situation})  # noqa: E501
                    self.assertEqual(facets[situation], response.data['count'])

    def test_more_than_one_page(self):
        for i in range(25):
            Customer.objects.create(shop=self.shop, name=f'Zed {i:02d}')
        first = self.client.get(reverse('customer-list'), {'situation': 'all'}).data
        self.assertEqual(first['count'], 30)
        second = self.client.get(reverse('customer-list'), {'situation': 'all', 'page': 2}).data  # noqa: E501
        names = [c['name'] for c in first['results'] + second['results']]
        self.assertEqual(len(set(names)), 30)
        self.assertEqual(self.client.get(reverse('customer-facets')).data['situation']['all'], 30)  # noqa: E501
        self.assertEqual(self.client.get(reverse('customer-summary')).data['active']['count'], 29)  # noqa: E501

    def test_other_shop_never_counted(self):
        self.assertNotIn('Intrus', self._names(situation='all'))
        self.assertNotIn('Intrus', self._names(situation='pending'))
        self.assertEqual(self.client.get(reverse('customer-facets')).data['situation']['all'], 5)  # noqa: E501
        self.assertEqual(self.client.get(reverse('customer-summary')).data['due']['amount'], '70.00')  # noqa: E501
