from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.test_utils import image_bytes
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
            'stock': {'all': 4, 'negative': 0, 'out': 1, 'low': 1, 'in': 1},
        })
        facets = self.facets('?state=all&type=product')
        self.assertEqual(
            facets['stock'], {'all': 4, 'negative': 0, 'out': 1, 'low': 1, 'in': 2},
        )
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
            'negative_stock': 0, 'out_of_stock': 1, 'low_stock': 1, 'inactive': 1,
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
        self.assertEqual(
            response.data['stock'],
            {'all': 25, 'negative': 0, 'out': 1, 'low': 0, 'in': 24},
        )


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
        file = SimpleUploadedFile(name, image_bytes('PNG'), content_type='image/png')
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


# ─── C4 : création atomique, suppression d'un article jamais utilisé ────────


class ProductAtomicCreateTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup_user_shop('atomic@example.com')
        self.client.force_authenticate(user=self.user)

    def payload(self, **variant):
        return {
            'name': 'Sandales', 'type': 'product', 'description': '',
            'variant': {
                'packaging_name': 'Par défaut', 'base_quantity': '1', 'unit': 'piece',
                'selling_price': '30.00', 'purchase_price': '12.00', **variant,
            },
            'initial_stock': '6',
        }

    def test_article_format_and_initial_stock_in_one_call(self):
        response = self.client.post(reverse('product-list'), self.payload(), format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        [variant] = response.data['variants']
        self.assertEqual(variant['stock_quantity'], '6.000')
        from apps.stock.models import StockMovement
        movement = StockMovement.objects.get(variant_id=variant['id'])
        self.assertEqual(
            (movement.movement_type, movement.reason, str(movement.unit_purchase_price)),  # noqa: E501
            ('in', 'Stock initial', '12.00'),
        )
        self.assertTrue(response.data['can_delete'])

    def test_invalid_format_creates_nothing(self):
        response = self.client.post(
            reverse('product-list'), self.payload(selling_price='-1'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Product.objects.filter(shop=self.shop).exists())

    def test_failure_after_the_article_rolls_back(self):
        from unittest import mock

        with mock.patch(
            'apps.stock.services.create_movement', side_effect=RuntimeError('panne'),
        ):
            response = self.client.post(
                reverse('product-list'), self.payload(), format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(Product.objects.filter(shop=self.shop).exists())

    def test_service_has_no_initial_stock(self):
        data = {**self.payload(), 'type': 'service'}
        response = self.client.post(reverse('product-list'), data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('initial_stock', response.data['errors'])


class ProductDeleteTest(TestCase):
    MESSAGE = 'Cet article a déjà servi : désactivez-le plutôt.'

    def setUp(self):
        from apps.products.services import create_product

        self.client = APIClient()
        self.user, self.shop = setup_user_shop('delete@example.com')
        self.client.force_authenticate(user=self.user)
        self.product = create_product(
            self.shop, self.user, {'name': 'Neuf'},
            [{'packaging_name': 'Par défaut', 'selling_price': '10.00', 'initial_stock': 4}],  # noqa: E501
        )
        self.variant = self.product.variants.get()

    def delete(self, product=None):
        product = product or self.product
        return self.client.delete(reverse('product-detail', args=[product.pk]))

    def test_never_used_article_is_deleted_with_its_initial_stock(self):
        self.assertEqual(self.delete().status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Product.objects.filter(pk=self.product.pk).exists())

    def test_sold_article_is_refused(self):
        from apps.orders import services as orders

        order = orders.create_order(self.shop, self.user)
        orders.add_item(order, self.variant, 1, user=self.user)
        response = self.delete()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['detail'], self.MESSAGE)
        self.assertTrue(Product.objects.filter(pk=self.product.pk).exists())

    def test_article_with_another_movement_is_refused(self):
        from apps.stock.services import create_movement

        create_movement(self.shop, self.variant, 'in', 2, 'Réassort', created_by=self.user)  # noqa: E501
        self.assertEqual(self.delete().status_code, status.HTTP_409_CONFLICT)
        detail = self.client.get(reverse('product-detail', args=[self.product.pk]))
        self.assertFalse(detail.data['can_delete'])

    def test_other_shop_article_is_not_found(self):
        _, other_shop = setup_user_shop('delete-other@example.com')
        foreign = make_product(other_shop)
        self.assertEqual(self.delete(foreign).status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Product.objects.filter(pk=foreign.pk).exists())

    def test_article_without_initial_stock_is_deleted(self):
        from apps.products.services import create_product

        bare = create_product(
            self.shop, self.user, {'name': 'Sans stock'},
            [{'packaging_name': 'Par défaut', 'selling_price': '5.00'}],
        )
        detail = self.client.get(reverse('product-detail', args=[bare.pk]))
        self.assertTrue(detail.data['can_delete'])
        self.assertEqual(self.delete(bare).status_code, status.HTTP_204_NO_CONTENT)

    def test_initial_stock_is_recognised_whatever_its_reason(self):
        """Le stock initial se reconnaît à son indicateur, pas à son motif."""
        from apps.stock.models import StockMovement

        StockMovement.objects.filter(variant=self.variant).update(reason='Mise en rayon')  # noqa: E501
        detail = self.client.get(reverse('product-detail', args=[self.product.pk]))
        self.assertTrue(detail.data['can_delete'])
        self.assertTrue(detail.data['variants'][0]['can_delete'])
        self.assertEqual(self.delete().status_code, status.HTTP_204_NO_CONTENT)

    def test_entry_worded_as_initial_stock_is_refused(self):
        from apps.products.services import INITIAL_STOCK_REASON
        from apps.stock.services import EntryLine, EntryReference, create_entry

        create_entry(
            self.shop, self.user, [EntryLine(variant=self.variant, quantity=Decimal('2'))],  # noqa: E501
            EntryReference(),
        )
        self.variant.stock_movements.exclude(is_initial=True).update(reason=INITIAL_STOCK_REASON)  # noqa: E501
        detail = self.client.get(reverse('product-detail', args=[self.product.pk]))
        self.assertFalse(detail.data['can_delete'])
        self.assertEqual(self.delete().status_code, status.HTTP_409_CONFLICT)


class ProductVariantDeleteTest(TestCase):
    MESSAGE = 'Ce format a déjà servi : retirez-le de la vente.'

    def setUp(self):
        from apps.products.services import create_product, create_variant

        self.client = APIClient()
        self.user, self.shop = setup_user_shop('variant-delete@example.com')
        self.client.force_authenticate(user=self.user)
        self.product = create_product(
            self.shop, self.user, {'name': 'Huile'},
            [{'packaging_name': '1 L', 'selling_price': '10.00'}],
        )
        self.variant = create_variant(
            self.product, self.user,
            {'packaging_name': '5 L', 'selling_price': '45.00'}, Decimal('3'),
        )

    def delete(self, variant=None):
        variant = variant or self.variant
        return self.client.delete(
            reverse('product-variant-detail', args=[variant.product_id, variant.pk]),
        )

    def movements(self):
        from apps.stock.models import StockMovement
        return StockMovement.objects.filter(variant=self.variant)

    def test_never_used_format_is_deleted_with_its_initial_stock(self):
        from apps.products.models import ProductVariant
        from apps.stock.models import StockMovement

        initial = self.movements().get()
        self.assertEqual(self.delete().status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProductVariant.objects.filter(pk=self.variant.pk).exists())
        self.assertFalse(StockMovement.objects.filter(pk=initial.pk).exists())

    def test_sold_format_is_refused_and_history_kept(self):
        from apps.orders import services as orders

        order = orders.create_order(self.shop, self.user)
        orders.add_item(order, self.variant, 1, user=self.user)
        movements = self.movements().count()
        response = self.delete()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['detail'], self.MESSAGE)
        self.assertEqual(self.movements().count(), movements)
        self.assertTrue(order.items.filter(variant=self.variant).exists())

    def test_format_with_another_movement_is_refused(self):
        from apps.stock.services import create_movement

        create_movement(self.shop, self.variant, 'loss', 1, created_by=self.user)
        self.assertEqual(self.delete().status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.movements().count(), 2)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 2)

    def test_last_format_is_refused(self):
        self.assertEqual(self.delete().status_code, status.HTTP_204_NO_CONTENT)
        last = self.product.variants.get()
        self.assertEqual(self.delete(last).status_code, status.HTTP_400_BAD_REQUEST)

    def test_other_shop_format_is_not_found(self):
        _, other_shop = setup_user_shop('variant-delete-other@example.com')
        foreign = make_product(other_shop).variants.get()
        self.assertEqual(self.delete(foreign).status_code, status.HTTP_404_NOT_FOUND)

    def test_can_delete_flag_per_format(self):
        from apps.stock.services import create_movement

        create_movement(self.shop, self.variant, 'loss', 1, created_by=self.user)
        data = self.client.get(reverse('product-detail', args=[self.product.pk])).data
        flags = {v['packaging_name']: v['can_delete'] for v in data['variants']}
        self.assertEqual(flags, {'1 L': True, '5 L': False})

    def test_last_active_format_can_be_neither_withdrawn_nor_deleted(self):
        first = self.product.variants.get(packaging_name='1 L')
        url = reverse('product-variant-detail', args=[self.product.pk, first.pk])
        withdrawn = self.client.patch(url, {'is_active': False}, format='json')
        self.assertEqual(withdrawn.status_code, status.HTTP_200_OK)
        last = reverse('product-variant-detail', args=[self.product.pk, self.variant.pk])  # noqa: E501
        refused = self.client.patch(last, {'is_active': False}, format='json')
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.delete().status_code, status.HTTP_400_BAD_REQUEST)
        self.variant.refresh_from_db()
        self.assertTrue(self.variant.is_active)
        # Le format retiré, lui, peut être supprimé (il n'a jamais servi).
        self.assertEqual(self.delete(first).status_code, status.HTTP_204_NO_CONTENT)


@override_settings(AWS_S3_ENDPOINT_URL='https://s3.test', AWS_ACCESS_KEY_ID='test')
class ProductImageManageTest(TestCase):
    """Photo principale, retrait, lecture et remplacement du fichier (recadrage)."""

    def setUp(self):
        from unittest.mock import patch

        self.client = APIClient()
        self.user, self.shop = setup_user_shop('photos@example.com')
        self.client.force_authenticate(user=self.user)
        self.product = make_product(self.shop)
        for target in ('upload_fileobj', 'delete_object', 'download_bytes'):
            patcher = patch(f'apps.products.services.{target}', return_value=b'\x89PNG')
            setattr(self, target, patcher.start())
            self.addCleanup(patcher.stop)
        signed = patch('apps.core.storage.get_signed_url', side_effect=lambda key: f'https://s3.test/{key}')  # noqa: E501
        signed.start()
        self.addCleanup(signed.stop)
        self.first = self._upload(self.product)
        self.second = self._upload(self.product)

    def _upload(self, product, content_type='image/png'):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .services import upload_product_image
        file = SimpleUploadedFile('photo.png', image_bytes('PNG'), content_type=content_type)  # noqa: E501
        return upload_product_image(shop=product.shop, product_id=str(product.pk), file=file)  # noqa: E501

    def url(self, image, name='product-image-detail', product=None):
        return reverse(name, args=[(product or self.product).pk, image.pk])

    def primary(self):
        return set(self.product.images.filter(is_primary=True).values_list('pk', flat=True))  # noqa: E501

    def test_detail_lists_images_with_signed_url(self):
        data = self.client.get(reverse('product-detail', args=[self.product.pk])).data
        self.assertEqual([i['id'] for i in data['images']], [str(self.first.pk), str(self.second.pk)])  # noqa: E501
        self.assertTrue(data['images'][0]['url'].startswith('https://s3.test/products/'))  # noqa: E501
        self.assertNotIn('object_key', data['images'][0])
        self.assertTrue(self.first.object_key.endswith('.png'))

    def test_upload_endpoint_returns_the_new_primary_without_key(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        file = SimpleUploadedFile('new.png', image_bytes('PNG'), content_type='image/png')  # noqa: E501
        response = self.client.post(reverse('product-image-upload', args=[self.product.pk]), {'image': file}, format='multipart')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(response.data), {'id', 'url', 'is_primary', 'position', 'created_at'})  # noqa: E501
        self.assertTrue(response.data['is_primary'])
        self.assertEqual(response.data['position'], 2)

    def test_set_primary(self):
        response = self.client.patch(self.url(self.first), {'is_primary': True}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.primary(), {self.first.pk})

    def test_unset_primary_is_refused(self):
        response = self.client.patch(self.url(self.second), {'is_primary': False}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.primary(), {self.second.pk})

    def test_delete_primary_promotes_the_next_and_removes_the_file(self):
        key = self.second.object_key
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(self.url(self.second))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.primary(), {self.first.pk})
        self.delete_object.assert_called_once_with(key)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(self.url(self.first))
        self.assertFalse(self.product.images.exists())

    def test_read_file(self):
        response = self.client.get(self.url(self.first, 'product-image-file'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response.content, b'\x89PNG')
        self.download_bytes.assert_called_once_with(self.first.object_key)

    def test_replace_file_keeps_place_and_status(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        old_key = self.second.object_key
        file = SimpleUploadedFile('crop.jpg', image_bytes('JPEG'), content_type='image/jpeg')  # noqa: E501
        response = self.client.put(self.url(self.second, 'product-image-file'), {'image': file}, format='multipart')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.second.refresh_from_db()
        self.assertNotEqual(self.second.object_key, old_key)
        self.assertTrue(self.second.object_key.endswith('.jpg'))
        self.assertTrue(self.second.is_primary)
        self.assertEqual(self.second.position, 1)
        self.delete_object.assert_called_once_with(old_key)

    def test_replace_with_disallowed_type_is_refused(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        file = SimpleUploadedFile('x.gif', b'GIF8', content_type='image/gif')
        response = self.client.put(self.url(self.first, 'product-image-file'), {'image': file}, format='multipart')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_photo_count_is_limited(self):
        from rest_framework.exceptions import ValidationError
        from .services import PRODUCT_IMAGE_MAX_COUNT
        for _ in range(PRODUCT_IMAGE_MAX_COUNT - 2):
            self._upload(self.product)
        with self.assertRaises(ValidationError):
            self._upload(self.product)

    def test_other_shop_cannot_touch_images(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        intruder, _ = setup_user_shop('photos-intruder@example.com')
        self.client.force_authenticate(user=intruder)
        detail, file = self.url(self.first), self.url(self.first, 'product-image-file')
        png = SimpleUploadedFile('p.png', image_bytes('PNG'), content_type='image/png')
        responses = [
            self.client.patch(detail, {'is_primary': True}, format='json'),
            self.client.delete(detail),
            self.client.get(file),
            self.client.put(file, {'image': png}, format='multipart'),
        ]
        self.assertEqual({r.status_code for r in responses}, {status.HTTP_404_NOT_FOUND})  # noqa: E501
        self.assertEqual(self.primary(), {self.second.pk})
        self.assertEqual(self.product.images.count(), 2)
        self.assertEqual(self.upload_fileobj.call_count, 2)
        self.download_bytes.assert_not_called()

    def test_image_of_another_product_is_not_found(self):
        other = make_product(self.shop, name='Autre')
        url = self.url(self.first, product=other)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(self.url(self.first, 'product-image-file', other)).status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501


class ProductNegativeStateTest(TestCase):
    def test_negative_level_in_list_summary_and_facets(self):
        from apps.stock.services import create_movement

        client = APIClient()
        user, shop = setup_user_shop('negative@example.com')
        client.force_authenticate(user=user)
        product = make_product(shop, 'Vendu')
        create_movement(shop, product.variants.get(), 'reservation', 2, created_by=user)
        make_product(shop, 'Vide')

        listed = client.get(reverse('product-list'), {'stock': 'negative'}).data
        self.assertEqual([r['name'] for r in listed['results']], ['Vendu'])
        self.assertEqual(listed['results'][0]['stock_state'], 'negative')
        summary = client.get(reverse('product-summary')).data
        self.assertEqual((summary['negative_stock'], summary['out_of_stock']), (1, 1))
        facets = client.get(reverse('product-facets')).data
        self.assertEqual(facets['stock']['negative'], 1)


class ProductSheetFiguresTest(TestCase):
    """Fiche article : stock total, valeur d'achat, ventes sur 30 jours."""

    def setUp(self):
        from apps.products.models import ProductVariant
        from apps.stock.services import create_movement

        self.client = APIClient()
        self.user, self.shop = setup_user_shop('sheet@example.com')
        self.client.force_authenticate(user=self.user)
        self.product = make_product(self.shop, 'Chemise')
        self.small = self.product.variants.get()
        self.small.purchase_price = '12.00'
        self.small.save()
        self.large = ProductVariant.objects.create(
            shop=self.shop, product=self.product, packaging_name='L', unit='piece',
            base_quantity=1, selling_price='12.00', purchase_price='12.00', position=1,
        )
        create_movement(self.shop, self.small, 'in', 8, created_by=self.user)
        create_movement(self.shop, self.large, 'reservation', 1, created_by=self.user)

    def detail(self, product=None):
        product = product or self.product
        return self.client.get(reverse('product-detail', args=[product.pk])).data

    def sell(self, variant, quantity):
        from apps.orders import services as orders

        order = orders.create_order(self.shop, self.user)
        orders.add_item(order, variant, quantity, user=self.user)
        return order

    def test_total_counts_negative_formats_and_value_only_positive_stock(self):
        data = self.detail()
        self.assertEqual(Decimal(data['stock_total']), Decimal('7'))
        self.assertEqual(data['purchase_value'], '96.00')

    def test_inactive_format_and_format_without_price(self):
        from apps.products.models import ProductVariant
        from apps.stock.services import create_movement

        unpriced = ProductVariant.objects.create(
            shop=self.shop, product=self.product, packaging_name='M', unit='piece',
            base_quantity=1, selling_price='12.00', position=2,
        )
        create_movement(self.shop, unpriced, 'in', 3, created_by=self.user)
        self.large.is_active = False
        self.large.save()
        data = self.detail()
        self.assertEqual(Decimal(data['stock_total']), Decimal('11'))
        self.assertEqual(data['purchase_value'], '96.00')

    def test_no_purchase_price_gives_no_value(self):
        product = make_product(self.shop, 'Sans prix')
        self.assertIsNone(self.detail(product)['purchase_value'])

    def test_service_has_no_stock_figures(self):
        service = make_product(self.shop, 'Retouche')
        service.type = 'service'
        service.save()
        data = self.detail(service)
        self.assertIsNone(data['stock_total'])
        self.assertIsNone(data['purchase_value'])

    def test_sales_last_30_days_skip_cancelled_and_old_orders(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.orders.models import Order

        self.sell(self.small, 2)
        self.sell(self.large, 1)
        cancelled = self.sell(self.small, 5)
        Order.objects.filter(pk=cancelled.pk).update(status='cancelled')
        old = self.sell(self.small, 4)
        Order.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=31))  # noqa: E501
        self.sell(make_product(self.shop, 'Autre').variants.get(), 3)

        sales = self.detail()['sales_30d']
        self.assertEqual(sales['quantity'], 3)
        self.assertEqual(Decimal(sales['amount']), Decimal('32.00'))

    def test_no_sales(self):
        self.assertEqual(self.detail()['sales_30d'], {'quantity': 0, 'amount': '0.00'})


class ProductVariantCreateTest(TestCase):
    """Nouveau format avec son stock initial, en un seul appel."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup_user_shop('variant-create@example.com')
        self.client.force_authenticate(user=self.user)
        self.product = make_product(self.shop, 'Sandales')

    def post(self, payload, product=None):
        product = product or self.product
        url = reverse('product-variant-list', args=[product.pk])
        return self.client.post(url, payload, format='json')

    def test_format_and_initial_stock_recorded_together(self):
        from apps.stock.models import StockMovement

        response = self.post({
            'packaging_name': 'Pointure 41', 'unit': 'piece', 'base_quantity': '1',
            'selling_price': '25.00', 'purchase_price': '11.00', 'initial_stock': '6',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data['stock_quantity']), Decimal('6'))
        movement = StockMovement.objects.get(variant_id=response.data['id'])
        self.assertEqual((movement.movement_type, movement.unit_purchase_price), ('in', Decimal('11.00')))  # noqa: E501
        detail = self.client.get(reverse('product-detail', args=[self.product.pk]))
        self.assertTrue(detail.data['can_delete'])

    def test_invalid_format_records_nothing(self):
        from apps.stock.models import StockMovement

        response = self.post({'packaging_name': 'Par défaut', 'selling_price': '5.00', 'initial_stock': '3'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.product.variants.count(), 1)
        self.assertFalse(StockMovement.objects.filter(variant__product=self.product).exists())  # noqa: E501

    def test_service_refuses_initial_stock(self):
        self.product.type = 'service'
        self.product.save()
        response = self.post({'packaging_name': 'Une heure', 'selling_price': '30.00', 'initial_stock': '2'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('initial_stock', response.data['errors'])

    def test_other_shop_product_is_not_found(self):
        _, other_shop = setup_user_shop('variant-other@example.com')
        foreign = make_product(other_shop)
        response = self.post({'packaging_name': 'XL', 'selling_price': '5.00'}, foreign)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(foreign.variants.count(), 1)

    def test_duplicate_sku_in_shop_is_refused(self):
        self.product.variants.update(sku='SAN-41')
        response = self.post({'packaging_name': 'Pointure 42', 'selling_price': '5.00', 'sku': 'SAN-41'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['sku'], ['Cette référence est déjà utilisée par un autre format.'])  # noqa: E501
        self.assertEqual(self.product.variants.count(), 1)

    def test_patch_to_existing_sku_is_refused(self):
        self.product.variants.update(sku='SAN-41')
        created = self.post({'packaging_name': 'Pointure 42', 'selling_price': '5.00', 'sku': 'SAN-42'})  # noqa: E501
        url = reverse('product-variant-detail', args=[self.product.pk, created.data['id']])  # noqa: E501
        response = self.client.patch(url, {'sku': 'SAN-41'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sku', response.data['errors'])
        # Sa propre référence reste acceptée.
        response = self.client.patch(url, {'sku': 'SAN-42', 'selling_price': '6.00'}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_same_sku_in_other_shop_is_allowed(self):
        _, other_shop = setup_user_shop('variant-sku-other@example.com')
        make_product(other_shop).variants.update(sku='SAN-41')
        response = self.post({'packaging_name': 'Pointure 42', 'selling_price': '5.00', 'sku': 'SAN-41'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


def format_row(name, price='29.99', **extra):
    return {'packaging_name': name, 'selling_price': price, **extra}


class ProductFormatsCreateTest(TestCase):
    """Création d'un article et de son tableau de formats, en un seul appel."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup_user_shop('formats-create@example.com')
        self.client.force_authenticate(user=self.user)

    def post(self, rows, **data):
        payload = {'name': 'Chemise en lin', 'type': 'product', 'variants': rows, **data}  # noqa: E501
        return self.client.post(reverse('product-list'), payload, format='json')

    def test_three_formats_with_their_initial_stock(self):
        from apps.stock.models import StockMovement

        response = self.post([
            format_row('Taille S', purchase_price='12.00', initial_stock='4', low_stock_threshold='2'),  # noqa: E501
            format_row('Taille M', purchase_price='12.00', initial_stock='6', sku='CHL-M'),  # noqa: E501
            format_row('Taille L', '31.99', initial_stock='3'),
        ])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        variants = response.data['variants']
        self.assertEqual(
            [(v['packaging_name'], v['position'], v['stock_quantity']) for v in variants],  # noqa: E501
            [('Taille S', 0, '4.000'), ('Taille M', 1, '6.000'), ('Taille L', 2, '3.000')],  # noqa: E501
        )
        self.assertEqual(response.data['stock_total'], '13.000')
        movements = StockMovement.objects.filter(variant__product_id=response.data['id'])  # noqa: E501
        self.assertEqual(movements.count(), 3)
        self.assertTrue(all(m.is_initial for m in movements))

    def test_one_invalid_row_creates_nothing(self):
        from apps.stock.models import StockMovement

        response = self.post([
            format_row('Taille S', initial_stock='4'), format_row('Taille M', '-1'),
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('selling_price', response.json()['errors']['variants']['1'])
        self.assertFalse(Product.objects.filter(shop=self.shop).exists())
        self.assertFalse(StockMovement.objects.filter(shop=self.shop).exists())

    def test_blank_name_is_refused(self):
        response = self.post([format_row('Taille S'), format_row('  ')])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('packaging_name', response.json()['errors']['variants']['1'])

    def test_duplicate_names_are_refused_whatever_the_case(self):
        response = self.post([format_row('Taille M'), format_row('taille m')])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('packaging_name', response.json()['errors']['variants']['1'])
        self.assertFalse(Product.objects.filter(shop=self.shop).exists())

    def test_reference_of_another_article_is_refused(self):
        make_catalog_item(self.shop, 'Pantalon', sku='REF-1')
        response = self.post([format_row('Taille S', sku='REF-1')])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sku', response.json()['errors']['variants']['0'])
        self.assertFalse(Product.objects.filter(name='Chemise en lin').exists())

    def test_service_formats_have_no_initial_stock(self):
        response = self.post([format_row('Une heure', initial_stock='2')], type='service')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('initial_stock', response.json()['errors']['variants']['0'])

    def test_at_least_one_format_on_sale(self):
        response = self.post([format_row('Taille S', is_active=False)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Product.objects.filter(shop=self.shop).exists())

    def test_reference_of_another_shop_is_free(self):
        _, other_shop = setup_user_shop('formats-other@example.com')
        make_catalog_item(other_shop, 'Pantalon', sku='REF-1')
        response = self.post([format_row('Taille S', sku='REF-1')])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ProductFormatsSyncTest(TestCase):
    """Modification de l'article et de son tableau de formats, tout ou rien."""

    def setUp(self):
        from apps.products.services import create_product

        self.client = APIClient()
        self.user, self.shop = setup_user_shop('formats-sync@example.com')
        self.client.force_authenticate(user=self.user)
        self.product = create_product(self.shop, self.user, {'name': 'Chemise'}, [
            format_row('Taille S', initial_stock=4), format_row('Taille M', initial_stock=6),  # noqa: E501
            format_row('Taille L', initial_stock=3),
        ])
        self.s, self.m, self.l = self.product.variants.order_by('position')

    def row(self, variant, **changes):
        return {
            'id': str(variant.pk), 'packaging_name': variant.packaging_name,
            'selling_price': str(variant.selling_price), **changes,
        }

    def patch(self, rows, product=None, **data):
        product = product or self.product
        url = reverse('product-detail', args=[product.pk])
        return self.client.patch(url, {'variants': rows, **data}, format='json')

    def sell(self, variant):
        from apps.orders import services as orders

        order = orders.create_order(self.shop, self.user)
        orders.add_item(order, variant, 1, user=self.user)

    def test_add_modify_and_delete_in_one_call(self):
        from apps.stock.models import StockMovement

        response = self.patch([
            self.row(self.s, selling_price='27.00'), self.row(self.m),
            format_row('Taille XL', '33.00', initial_stock='2'),
        ], name='Chemise en lin')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Chemise en lin')
        names = [(v['packaging_name'], v['selling_price'], v['stock_quantity']) for v in response.data['variants']]  # noqa: E501
        self.assertEqual(names, [
            ('Taille S', '27.00', '4.000'), ('Taille M', '29.99', '6.000'),
            ('Taille XL', '33.00', '2.000'),
        ])
        self.assertFalse(self.product.variants.filter(pk=self.l.pk).exists())
        self.assertFalse(StockMovement.objects.filter(variant_id=self.l.pk).exists())
        added = StockMovement.objects.get(variant__packaging_name='Taille XL')
        self.assertTrue(added.is_initial)

    def test_used_format_cannot_be_deleted_and_nothing_changes(self):
        self.sell(self.l)
        response = self.patch([self.row(self.s, selling_price='1'), self.row(self.m)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Taille L', response.data['errors']['variants'][0])
        self.s.refresh_from_db()
        self.assertEqual(self.s.selling_price, Decimal('29.99'))
        self.assertTrue(self.product.variants.filter(pk=self.l.pk).exists())

    def test_used_format_is_withdrawn_from_sale(self):
        self.sell(self.l)
        response = self.patch([self.row(self.s), self.row(self.m), self.row(self.l, is_active=False)])  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.l.refresh_from_db()
        self.assertFalse(self.l.is_active)
        self.assertTrue(self.product.variants.filter(pk=self.l.pk).exists())

    def test_last_active_format_is_protected(self):
        response = self.patch([
            self.row(self.s, is_active=False), self.row(self.m, is_active=False),
            self.row(self.l, is_active=False),
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.product.variants.filter(is_active=True).count(), 3)

    def test_formats_can_swap_names(self):
        response = self.patch([
            self.row(self.s, packaging_name='Taille M'), self.row(self.m, packaging_name='Taille S'),  # noqa: E501
            self.row(self.l),
        ])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.s.refresh_from_db()
        self.assertEqual(self.s.packaging_name, 'Taille M')

    def test_order_of_the_table_becomes_the_order_of_formats(self):
        response = self.patch([self.row(self.l), self.row(self.s), self.row(self.m)])
        self.assertEqual(
            [v['packaging_name'] for v in response.data['variants']],
            ['Taille L', 'Taille S', 'Taille M'],
        )

    def test_existing_format_stock_is_not_set_by_the_table(self):
        response = self.patch([self.row(self.s, initial_stock='50'), self.row(self.m), self.row(self.l)])  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('initial_stock', response.json()['errors']['variants']['0'])
        self.s.refresh_from_db()
        self.assertEqual(self.s.stock_quantity, Decimal('4'))

    def test_duplicate_names_are_refused(self):
        response = self.patch([self.row(self.s), self.row(self.m), format_row('TAILLE S')])  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('packaging_name', response.json()['errors']['variants']['2'])
        self.assertEqual(self.product.variants.count(), 3)

    def test_format_of_another_shop_is_untouched(self):
        _, other_shop = setup_user_shop('formats-sync-other@example.com')
        foreign = make_catalog_item(other_shop, 'Chemise', prices=('10.00',)).variants.get()  # noqa: E501
        response = self.patch([self.row(self.s), self.row(foreign, selling_price='1.00')])  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('id', response.json()['errors']['variants']['1'])
        foreign.refresh_from_db()
        self.assertEqual(foreign.selling_price, Decimal('10.00'))
        self.assertEqual(self.product.variants.count(), 3)

    def test_article_of_another_shop_is_not_found(self):
        _, other_shop = setup_user_shop('formats-sync-foreign@example.com')
        foreign = make_catalog_item(other_shop, 'Robe', prices=('10.00',))
        response = self.patch([format_row('Taille S')], product=foreign)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(foreign.variants.count(), 1)

    def test_without_variants_only_the_information_changes(self):
        url = reverse('product-detail', args=[self.product.pk])
        response = self.client.patch(url, {'description': 'Lin lavé'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['variants']), 3)
