from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from apps.customers.models import Customer
from apps.stock.models import StockMovement
from . import services


def setup(email):
    from apps.subscriptions.test_utils import attach_subscription
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    attach_subscription(shop)  # Plan Pro requis pour les endpoints orders.
    product = Product.objects.create(shop=shop, name='Article test')
    variant = ProductVariant.objects.create(
        shop=shop, product=product, packaging_name='Par défaut',
        unit='piece', base_quantity=1, selling_price='20.00',
    )
    StockMovement.objects.create(shop=shop, variant=variant, movement_type='in', quantity=50, created_by=user)  # noqa: E501
    customer = Customer.objects.create(shop=shop, name='Client test')
    return user, shop, product, variant, customer


class OrderServiceTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.product, self.variant, self.customer = setup('service@example.com')  # noqa: E501

    def test_create_order_generates_number(self):
        from django.utils import timezone
        order = services.create_order(self.shop, self.user)
        self.assertTrue(order.order_number.startswith(str(timezone.now().year)))

    def test_order_numbers_are_sequential(self):
        o1 = services.create_order(self.shop, self.user)
        o2 = services.create_order(self.shop, self.user)
        seq1 = int(o1.order_number.split('-')[1])
        seq2 = int(o2.order_number.split('-')[1])
        self.assertEqual(seq2, seq1 + 1)

    def test_add_item_calculates_total(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 3)
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('60.00'))
        self.assertEqual(order.total_amount, Decimal('60.00'))

    def test_total_with_discount_and_shipping(self):
        order = services.create_order(self.shop, self.user, discount=Decimal('5'), shipping=Decimal('3'))  # noqa: E501
        services.add_item(order, self.variant, 2)
        order.refresh_from_db()
        # 40 - 5 + 3 = 38
        self.assertEqual(order.total_amount, Decimal('38.00'))

    def test_transition_to_prepare_reserves_stock(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 5)
        services.transition_status(order, 'to_prepare', self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 45)  # 50 - 5
        self.assertTrue(order.stock_reserved)

    def test_cancel_releases_stock(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 5)
        services.transition_status(order, 'to_prepare', self.user)
        services.transition_status(order, 'cancelled', self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 50)  # restauré
        self.assertFalse(order.stock_reserved)

    def test_invalid_transition_raises(self):
        order = services.create_order(self.shop, self.user)
        with self.assertRaises(ValueError):
            services.transition_status(order, 'shipped', self.user)  # draft → shipped interdit  # noqa: E501

    def test_shipped_order_cannot_transition(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        services.transition_status(order, 'prepared', self.user)
        services.transition_status(order, 'shipped', self.user)
        with self.assertRaises(ValueError):
            services.transition_status(order, 'cancelled', self.user)

    def test_payment_status_updates(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 2)  # total = 40
        order.refresh_from_db()
        services.update_payment(order, Decimal('20'))
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'partial')
        services.update_payment(order, Decimal('40'))
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')

    def test_cannot_add_item_to_non_draft(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        with self.assertRaises(ValueError):
            services.add_item(order, self.variant, 1)


class OrderAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.product, self.variant, self.customer = setup('api@example.com')  # noqa: E501
        self.client.force_authenticate(user=self.user)

    def test_create_order_via_api(self):
        response = self.client.post(reverse('order-list'), {
            'customer': str(self.customer.pk),
            'items': [{'variant': str(self.variant.pk), 'quantity': 2}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['subtotal'], '40.00')

    def test_create_order_without_customer(self):
        response = self.client.post(reverse('order-list'), {
            'items': [{'variant': str(self.variant.pk), 'quantity': 1}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['customer'])

    def test_list_filter_by_status(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        response = self.client.get(reverse('order-list') + '?status=to_prepare')
        self.assertEqual(response.data['count'], 1)

    def test_status_transition_via_api(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        response = self.client.post(reverse('order-status', kwargs={'pk': order.pk}), {'status': 'to_prepare'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'to_prepare')

    def test_cannot_delete_order(self):
        order = services.create_order(self.shop, self.user)
        response = self.client.delete(reverse('order-detail', kwargs={'pk': order.pk}))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class OrderMultiTenantTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a, self.product_a, self.variant_a, _ = setup('a@example.com')  # noqa: E501
        self.user_b, self.shop_b, self.product_b, self.variant_b, _ = setup('b@example.com')  # noqa: E501
        self.order_b = services.create_order(self.shop_b, self.user_b)

    def test_user_a_cannot_see_order_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('order-detail', kwargs={'pk': self.order_b.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_transition_order_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            reverse('order-status', kwargs={'pk': self.order_b.pk}),
            {'status': 'cancelled'},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class OrderListFilterAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.product, self.variant, self.customer = setup(  # noqa: E501
            'filter@example.com',
        )
        self.client.force_authenticate(user=self.user)

        self.user_b, self.shop_b, self.product_b, self.variant_b, _ = setup(  # noqa: E501
            'filter_b@example.com',
        )

    def _make_order(self, shop=None, user=None, status_val='draft', payment_status_val='unpaid'):  # noqa: E501
        s = shop or self.shop
        u = user or self.user
        order = services.create_order(s, u)
        services.add_item(order, self.variant if s == self.shop else self.variant_b, 1)
        if status_val != 'draft':
            path = {
                'to_prepare': ['to_prepare'],
                'prepared': ['to_prepare', 'prepared'],
                'shipped': ['to_prepare', 'prepared', 'shipped'],
                'cancelled': ['to_prepare', 'cancelled'],
            }
            for step in path.get(status_val, []):
                services.transition_status(order, step, u)
        if payment_status_val == 'paid':
            order.refresh_from_db()
            services.update_payment(order, order.total_amount, user=u)
        elif payment_status_val == 'partial':
            order.refresh_from_db()
            services.update_payment(order, order.total_amount / 2, user=u)
        return order

    def test_due_excludes_draft(self):
        self._make_order(status_val='draft', payment_status_val='unpaid')
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 0)

    def test_due_excludes_cancelled(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        services.transition_status(order, 'cancelled', self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 0)

    def test_due_excludes_paid(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        order.refresh_from_db()
        services.update_payment(order, order.total_amount, user=self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 0)

    def test_due_includes_correct(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 1)

    def test_due_other_shop_excluded(self):
        # commande due de l'autre boutique
        order_b = services.create_order(self.shop_b, self.user_b)
        services.add_item(order_b, self.variant_b, 1)
        services.transition_status(order_b, 'to_prepare', self.user_b)
        # commande due de ma boutique
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.transition_status(order, 'to_prepare', self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(order.id))

    def test_search_by_customer_name(self):
        customer = Customer.objects.create(shop=self.shop, name='Karima Benali')
        order = services.create_order(self.shop, self.user, customer=customer)
        services.add_item(order, self.variant, 1)
        response = self.client.get(reverse('order-list') + '?search=Karima')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(order.id))

    def test_search_by_order_number(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        number = order.order_number
        response = self.client.get(reverse('order-list') + f'?search={number}')
        self.assertGreaterEqual(response.data['count'], 1)
        ids = [r['id'] for r in response.data['results']]
        self.assertIn(str(order.id), ids)

    def test_items_preview_no_n_plus_one(self):
        # Crée 3 commandes avec 2 articles chacune
        for _ in range(3):
            order = services.create_order(self.shop, self.user)
            services.add_item(order, self.variant, 1)

        # shop_member×2 + subscription + plan + get_shop + count + list + items prefetch
        with self.assertNumQueries(8):
            response = self.client.get(reverse('order-list'))
        self.assertEqual(response.status_code, 200)
        # Les items_preview sont présents
        for item in response.data['results']:
            self.assertIn('items_preview', item)
