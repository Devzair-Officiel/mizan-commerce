from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from .models import StockMovement
from .services import create_movement


def setup(email):
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    product = Product.objects.create(shop=shop, name='Article')
    variant = ProductVariant.objects.create(
        shop=shop, product=product, packaging_name='Par défaut',
        unit='piece', base_quantity=1, selling_price='5.00',
    )
    return user, shop, product, variant


class StockMovementTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.product, self.variant = setup('stock@example.com')
        self.client.force_authenticate(user=self.user)

    def test_stock_in_updates_quantity(self):
        self.client.post(reverse('stock-in'), {'variant': str(self.variant.pk), 'quantity': 10})  # noqa: E501
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 10)

    def test_stock_out_requires_reason(self):
        StockMovement.objects.create(shop=self.shop, variant=self.variant, movement_type='in', quantity=10, created_by=self.user)  # noqa: E501
        response = self.client.post(reverse('stock-out'), {
            'variant': str(self.variant.pk), 'quantity': 3, 'reason': '',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_out_reduces_quantity(self):
        StockMovement.objects.create(shop=self.shop, variant=self.variant, movement_type='in', quantity=10, created_by=self.user)  # noqa: E501
        self.client.post(reverse('stock-out'), {
            'variant': str(self.variant.pk), 'quantity': 3, 'reason': 'Casse',
        })
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 7)

    def test_stock_out_blocked_if_insufficient(self):
        response = self.client.post(reverse('stock-out'), {
            'variant': str(self.variant.pk), 'quantity': 5, 'reason': 'Test',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_history_filtered_by_shop(self):
        _, shop_b, _, variant_b = setup('other@example.com')
        StockMovement.objects.create(shop=shop_b, variant=variant_b, movement_type='in', quantity=5, created_by=self.user)  # noqa: E501
        StockMovement.objects.create(shop=self.shop, variant=self.variant, movement_type='in', quantity=2, created_by=self.user)  # noqa: E501

        response = self.client.get(reverse('stock-movements'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)


class StockServiceTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.product, self.variant = setup('svc@example.com')

    def test_create_movement_valid(self):
        m = create_movement(
            self.shop, self.variant, 'in', 5, 'Réassort', created_by=self.user)
        self.assertEqual(m.movement_type, 'in')
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 5)

    def test_create_movement_invalid_type_raises(self):
        with self.assertRaises(ValueError):
            create_movement(self.shop, self.variant, 'unknown', 5)

    def test_create_movement_zero_quantity_raises(self):
        with self.assertRaises(ValueError):
            create_movement(self.shop, self.variant, 'in', 0)

    def test_create_movement_negative_quantity_raises(self):
        with self.assertRaises(ValueError):
            create_movement(self.shop, self.variant, 'in', -1)

    def test_create_movement_service_product_refused(self):
        service_product = Product.objects.create(
            shop=self.shop, name='Service', type='service')
        service_variant = ProductVariant.objects.create(
            shop=self.shop, product=service_product, packaging_name='Par défaut',
            unit='piece', base_quantity=1, selling_price='10.00',
        )
        with self.assertRaises(ValueError):
            create_movement(self.shop, service_variant, 'in', 1)

    def test_create_movement_wrong_shop_refused(self):
        _, other_shop, _, _ = setup('other_svc@example.com')
        with self.assertRaises(ValueError):
            create_movement(other_shop, self.variant, 'in', 1)
