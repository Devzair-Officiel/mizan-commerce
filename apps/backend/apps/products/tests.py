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
            reverse('product-variant-detail', kwargs={'pk': product.pk, 'variant_pk': variant.pk}),  # noqa: E501
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
        response = self.client.get(reverse('product-detail', kwargs={'pk': self.product_b.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_list_shows_only_own_products(self):
        make_product(self.shop_a, 'Produit A')
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('product-list'))
        names = [p['name'] for p in response.data['results']]
        self.assertIn('Produit A', names)
        self.assertNotIn('Produit B', names)


def make_catalog_item(
    shop, name, *, type='product', prices=('10.00',), stock=(), threshold=None,
    is_active=True, sku='', barcode='',
):
    """Article (ou service) avec un format par prix ; `stock[i]` entre en stock au format i."""  # noqa: E501
    from decimal import Decimal
    from apps.products.models import ProductVariant
    from apps.stock.services import create_movement

    product = Product.objects.create(shop=shop, name=name, type=type, is_active=is_active)  # noqa: E501
    for position, price in enumerate(prices):
        variant = ProductVariant.objects.create(
            shop=shop, product=product, packaging_name=f'Format {position}',
            unit='piece', base_quantity=1, selling_price=price, position=position,
            low_stock_threshold=threshold, sku=sku if position == 0 else '',
            barcode=barcode if position == 0 else '',
        )
        quantity = stock[position] if position < len(stock) else 0
        if quantity:
            create_movement(shop, variant, 'in', Decimal(quantity))
    return product


class ProductListTest(TestCase):
    """Liste Articles : tris, filtres, facettes et pagination côté serveur."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup_user_shop('catalog@example.com')
        self.client.force_authenticate(user=self.user)
        item = make_catalog_item
        item(self.shop, 'Café', prices=('8.00', '15.00'), stock=(3, 4), threshold=2,
             sku='CAF-01', barcode='3017620422003')
        item(self.shop, 'Bougie', prices=('12.00',), stock=(2,), threshold=5)
        item(self.shop, 'Argan', prices=('30.00',), stock=())
        item(self.shop, 'Coupe', type='service', prices=('25.00',))
        item(self.shop, 'Ancien', prices=('5.00',), stock=(9,), is_active=False)

    def names(self, query: str = '') -> list[str]:
        response = self.client.get(reverse('product-list') + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [p['name'] for p in response.data['results']]

    def facets(self, query: str = '') -> dict:
        response = self.client.get(reverse('product-facets') + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_sort_by_name(self):
        self.assertEqual(self.names('?ordering=name'), ['Argan', 'Bougie', 'Café', 'Coupe'])  # noqa: E501
        self.assertEqual(self.names('?ordering=-name'), ['Coupe', 'Café', 'Bougie', 'Argan'])  # noqa: E501

    def test_sort_by_created_at(self):
        self.assertEqual(self.names('?ordering=created_at'), ['Café', 'Bougie', 'Argan', 'Coupe'])  # noqa: E501
        self.assertEqual(self.names(), ['Coupe', 'Argan', 'Bougie', 'Café'])

    def test_sort_by_min_price_of_active_formats(self):
        self.assertEqual(self.names('?ordering=min_price'), ['Café', 'Bougie', 'Coupe', 'Argan'])  # noqa: E501
        self.assertEqual(self.names('?ordering=-min_price'), ['Argan', 'Coupe', 'Bougie', 'Café'])  # noqa: E501

    def test_sort_by_total_stock_keeps_services_last(self):
        self.assertEqual(self.names('?ordering=total_stock'), ['Argan', 'Bougie', 'Café', 'Coupe'])  # noqa: E501
        self.assertEqual(self.names('?ordering=-total_stock'), ['Café', 'Bougie', 'Argan', 'Coupe'])  # noqa: E501

    def test_sort_by_type_then_name(self):
        self.assertEqual(self.names('?ordering=type'), ['Argan', 'Bougie', 'Café', 'Coupe'])  # noqa: E501
        self.assertEqual(self.names('?ordering=-type'), ['Coupe', 'Argan', 'Bougie', 'Café'])  # noqa: E501

    def test_total_stock_sums_active_formats_and_is_null_for_services(self):
        response = self.client.get(reverse('product-list') + '?ordering=name')
        stock = {p['name']: p['total_stock'] for p in response.data['results']}
        self.assertEqual(stock, {'Argan': '0.000', 'Bougie': '2.000', 'Café': '7.000', 'Coupe': None})  # noqa: E501

    def test_filter_state(self):
        self.assertNotIn('Ancien', self.names())
        self.assertEqual(self.names('?state=inactive'), ['Ancien'])
        self.assertEqual(len(self.names('?state=all')), 5)
        # Anciens paramètres, encore utilisés par les sélecteurs.
        self.assertEqual(self.names('?inactive=1'), ['Ancien'])
        self.assertEqual(len(self.names('?all=1')), 5)

    def test_filter_type(self):
        self.assertEqual(self.names('?type=service'), ['Coupe'])
        self.assertEqual(sorted(self.names('?type=product')), ['Argan', 'Bougie', 'Café'])  # noqa: E501

    def test_filter_stock_levels(self):
        self.assertEqual(self.names('?stock=out'), ['Argan'])
        self.assertEqual(self.names('?stock=low'), ['Bougie'])
        self.assertEqual(self.names('?stock=in'), ['Café'])
        self.assertEqual(self.names('?stock=in&state=all&ordering=name'), ['Ancien', 'Café'])  # noqa: E501
        self.assertEqual(self.names('?out_of_stock=1'), ['Argan'])
        self.assertEqual(self.names('?low_stock=1'), ['Bougie'])

    def test_search_on_name_reference_and_barcode(self):
        self.assertEqual(self.names('?search=bougie'), ['Bougie'])
        self.assertEqual(self.names('?search=CAF-01'), ['Café'])
        self.assertEqual(self.names('?search=3017620422003'), ['Café'])

    def test_facets_count_each_option_with_the_other_filters(self):
        self.assertEqual(self.facets(), {
            'state': {'all': 5, 'active': 4, 'inactive': 1},
            'type': {'all': 4, 'product': 3, 'service': 1},
            'stock': {'all': 4, 'out': 1, 'low': 1, 'in': 1},
        })
        facets = self.facets('?state=all&type=product')
        self.assertEqual(facets['stock'], {'all': 4, 'out': 1, 'low': 1, 'in': 2})
        self.assertEqual(facets['type'], {'all': 5, 'product': 4, 'service': 1})

    def test_facets_match_the_list(self):
        queries = ['', '?search=a', '?type=product', '?stock=low', '?state=all&search=c']  # noqa: E501
        for base in queries:
            facets = self.facets(base)
            sep = '&' if base else '?'
            for name, options in facets.items():
                for option, count in options.items():
                    if option == 'all':
                        continue
                    with self.subTest(query=base, filter=name, option=option):
                        self.assertEqual(len(self.names(f'{base}{sep}{name}={option}')), count)  # noqa: E501

    def test_summary(self):
        response = self.client.get(reverse('product-summary'))
        self.assertEqual(response.data, {
            'total': 4, 'products': 3, 'services': 1,
            'out_of_stock': 1, 'low_stock': 1, 'inactive': 1,
        })


class ProductListPaginationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup_user_shop('many@example.com')
        self.client.force_authenticate(user=self.user)
        for index in range(25):
            make_catalog_item(self.shop, f'Article {index:02d}', stock=(index,))

    def test_list_is_paginated_and_sorted_across_pages(self):
        first = self.client.get(reverse('product-list') + '?ordering=-total_stock').data
        second = self.client.get(reverse('product-list') + '?ordering=-total_stock&page=2').data  # noqa: E501
        self.assertEqual(first['count'], 25)
        self.assertEqual(len(first['results']), 20)
        self.assertEqual(len(second['results']), 5)
        self.assertEqual(first['results'][0]['name'], 'Article 24')
        self.assertEqual(second['results'][-1]['name'], 'Article 00')

    def test_facets_count_beyond_the_first_page(self):
        response = self.client.get(reverse('product-facets'))
        self.assertEqual(response.data['stock'], {'all': 25, 'out': 1, 'low': 0, 'in': 24})  # noqa: E501


class ProductListMultiTenantTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a = setup_user_shop('list-a@example.com')
        _, self.shop_b = setup_user_shop('list-b@example.com')
        make_catalog_item(self.shop_a, 'Article A', stock=(1,))
        make_catalog_item(self.shop_b, 'Article B', barcode='999')
        make_catalog_item(self.shop_b, 'Service B', type='service')
        self.client.force_authenticate(user=self.user_a)

    def test_list_search_facets_and_summary_ignore_other_shops(self):
        names = [p['name'] for p in self.client.get(reverse('product-list') + '?state=all').data['results']]  # noqa: E501
        self.assertEqual(names, ['Article A'])
        self.assertEqual(self.client.get(reverse('product-list') + '?search=999').data['count'], 0)  # noqa: E501
        facets = self.client.get(reverse('product-facets') + '?state=all').data
        self.assertEqual(facets['type'], {'all': 1, 'product': 1, 'service': 0})
        summary = self.client.get(reverse('product-summary')).data
        self.assertEqual((summary['total'], summary['out_of_stock']), (1, 0))


class ProductImageUploadTest(TestCase):
    """La dernière photo envoyée devient la photo principale (remplacement)."""

    def setUp(self):
        self.user, self.shop = setup_user_shop('photo@example.com')
        self.product = make_product(self.shop)

    def _upload(self, name: str):
        from unittest.mock import patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .services import upload_product_image
        file = SimpleUploadedFile(name, b'\x89PNG', content_type='image/png')
        with patch('apps.products.services.upload_fileobj'):
            return upload_product_image(
                shop=self.shop, product_id=str(self.product.pk), file=file,
            )

    def test_new_upload_replaces_primary(self):
        first = self._upload('a.png')
        second = self._upload('b.png')
        first.refresh_from_db()
        self.assertTrue(second.is_primary)
        self.assertFalse(first.is_primary)
        self.assertEqual(second.position, 1)
        self.assertEqual(self.product.images.filter(is_primary=True).count(), 1)

    def test_upload_to_other_shop_product_is_refused(self):
        _, other_shop = setup_user_shop('photo-other@example.com')
        self.product.shop = other_shop
        self.product.save(update_fields=['shop'])
        with self.assertRaises(Product.DoesNotExist):
            self._upload('c.png')
