from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from apps.stock.models import StockMovement
from .models import ZakatCalculation
from . import services


def setup(email: str, currency: str = 'EUR'):
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}', currency=currency)
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


def _make_product(shop, name, selling_price, purchase_price, qty):
    p = Product.objects.create(shop=shop, name=name)
    v = ProductVariant.objects.create(
        shop=shop, product=p, packaging_name='Par défaut',
        unit='piece', base_quantity=1,
        selling_price=selling_price, purchase_price=purchase_price,
    )
    StockMovement.objects.create(shop=shop, variant=v, movement_type='in', quantity=qty)
    return p, v


class ZakatServiceTest(TestCase):
    def setUp(self):
        self.user, self.shop = setup('zakat-svc@example.com')

    def test_stock_estimate_sums_products(self):
        _make_product(self.shop, 'Produit A', Decimal('10.00'), Decimal('5.00'), 10)
        _make_product(self.shop, 'Produit B', Decimal('10.00'), Decimal('20.00'), 3)
        estimated = services.compute_stock_value(self.shop)
        self.assertEqual(estimated, Decimal('110.00'))

    def test_calculate_zakat_base(self):
        _make_product(self.shop, 'Produit A', Decimal('10.00'), Decimal('100.00'), 5)
        calc = services.calculate_zakat(
            shop=self.shop,
            reference_date='2025-03-01',
            cash_amount=Decimal('200.00'),
            receivables_amount=Decimal('50.00'),
            short_term_debts=Decimal('100.00'),
        )
        self.assertEqual(calc.stock_value_estimated, Decimal('500.00'))
        self.assertEqual(calc.zakat_base, Decimal('650.00'))
        self.assertEqual(calc.zakat_amount, Decimal('16.25'))

    def test_calculate_zakat_with_adjusted_stock(self):
        _make_product(self.shop, 'Produit A', Decimal('10.00'), Decimal('100.00'), 5)
        calc = services.calculate_zakat(
            shop=self.shop,
            reference_date='2025-03-01',
            stock_value_adjusted=Decimal('300.00'),
        )
        self.assertEqual(calc.stock_value_estimated, Decimal('500.00'))
        self.assertEqual(calc.zakat_base, Decimal('300.00'))

    def test_zakat_base_never_negative(self):
        calc = services.calculate_zakat(
            shop=self.shop,
            reference_date='2025-03-01',
            short_term_debts=Decimal('9999.00'),
        )
        self.assertEqual(calc.zakat_base, Decimal('0'))
        self.assertEqual(calc.zakat_amount, Decimal('0.00'))


class ZakatAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('zakat-api@example.com')
        self.client.force_authenticate(user=self.user)

    def test_stock_estimate_endpoint(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        response = self.client.get(reverse('zakat-stock-estimate'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['stock_value_estimated']), Decimal('80.00'))
        self.assertIn('disclaimer', response.data)

    def test_create_calculation(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        response = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
            'receivables_amount': '0',
            'short_term_debts': '0',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data['zakat_base']), Decimal('580.00'))

    def test_list_scoped_to_shop(self):
        user_b, shop_b = setup('b@example.com')
        ZakatCalculation.objects.create(
            shop=shop_b, reference_date='2025-01-01',
            currency='EUR', zakat_base=Decimal('0'), zakat_amount=Decimal('0'),
        )
        response = self.client.get(reverse('zakat-calculation-list'))
        self.assertEqual(response.data['count'], 0)

    def test_multitenant_isolation(self):
        user_b, shop_b = setup('c@example.com')
        calc = ZakatCalculation.objects.create(
            shop=shop_b, reference_date='2025-01-01',
            currency='EUR', zakat_base=Decimal('0'), zakat_amount=Decimal('0'),
        )
        response = self.client.get(reverse('zakat-calculation-detail', kwargs={'pk': calc.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
