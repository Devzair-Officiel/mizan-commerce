from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from .models import Product


def setup_user_shop(email):
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


def make_product(shop, name='Produit test'):
    from apps.products.models import ProductVariant
    product = Product.objects.create(shop=shop, name=name)
    ProductVariant.objects.create(
        shop=shop, product=product, packaging_name='Par défaut',
        unit='piece', base_quantity=1, selling_price='10.00', position=0,
    )
    return product


class ProductCRUDTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup_user_shop('seller@example.com')
        self.client.force_authenticate(user=self.user)

    def test_create_product(self):
        response = self.client.post(reverse('product-list'), {
            'name': 'Chemise',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Product.objects.filter(shop=self.shop).count(), 1)

    def test_list_products_active_only(self):
        make_product(self.shop, 'Actif')
        p2 = make_product(self.shop, 'Inactif')
        p2.is_active = False
        p2.save()
        response = self.client.get(reverse('product-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [p['name'] for p in response.data['results']]
        self.assertIn('Actif', names)
        self.assertNotIn('Inactif', names)

    def test_list_products_all_with_param(self):
        make_product(self.shop, 'Actif')
        p2 = make_product(self.shop, 'Inactif')
        p2.is_active = False
        p2.save()
        response = self.client.get(reverse('product-list') + '?all=1')
        names = [p['name'] for p in response.data['results']]
        self.assertIn('Inactif', names)

    def test_deactivate_product(self):
        product = make_product(self.shop)
        response = self.client.post(
            reverse('product-deactivate', kwargs={'pk': product.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product.refresh_from_db()
        self.assertFalse(product.is_active)

    def test_cannot_set_stock_directly_on_variant(self):
        product = make_product(self.shop)
        variant = product.variants.first()
        self.client.patch(
            reverse('product-variant-detail', kwargs={'pk': product.pk, 'variant_pk': variant.pk}),
            {'stock_quantity': 999},
        )
        variant.refresh_from_db()
        self.assertEqual(variant.stock_quantity, 0)


class ProductMultiTenantTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a = setup_user_shop('a@example.com')
        self.user_b, self.shop_b = setup_user_shop('b@example.com')
        self.product_b = make_product(self.shop_b, 'Produit B')

    def test_user_a_cannot_see_product_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('product-detail', kwargs={'pk': self.product_b.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_list_shows_only_own_products(self):
        make_product(self.shop_a, 'Produit A')
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('product-list'))
        names = [p['name'] for p in response.data['results']]
        self.assertIn('Produit A', names)
        self.assertNotIn('Produit B', names)
