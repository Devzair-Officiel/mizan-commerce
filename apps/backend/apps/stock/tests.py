from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from . import services
from .models import StockMovement
from .services import EntryReference, create_movement


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


# ─── C4 : règles du stock et API ────────────────────────────────────────────


def _variant(shop, name, *, packaging='Unité', price='10.00', purchase=None,
             threshold=None, sku='', barcode='', type_='product'):
    product = Product.objects.create(shop=shop, name=name, type=type_)
    return ProductVariant.objects.create(
        shop=shop, product=product, packaging_name=packaging, unit='piece',
        base_quantity=1, selling_price=price, purchase_price=purchase,
        low_stock_threshold=threshold, sku=sku, barcode=barcode,
    )


class _StockApiCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.product, self.variant = setup('c4@example.com')
        self.client.force_authenticate(user=self.user)

    def stock(self, variant):
        variant.refresh_from_db()
        return variant.stock_quantity

    def post(self, name, data):
        return self.client.post(reverse(name), data, format='json')


class NegativeStockTest(_StockApiCase):
    def test_sale_takes_stock_negative_then_entry_regularises(self):
        from apps.orders import services as orders

        create_movement(self.shop, self.variant, 'in', 1, created_by=self.user)
        order = orders.create_order(self.shop, self.user)
        orders.add_item(order, self.variant, 3, user=self.user)
        orders.reserve_stock(order, self.user)
        self.assertEqual(self.stock(self.variant), -2)
        self.assertTrue(self.variant.is_negative_stock)
        self.assertEqual(self.variant.stock_state, 'negative')

        levels = self.client.get(reverse('stock-levels'), {'state': 'negative'}).data
        self.assertEqual([r['id'] for r in levels['results']], [str(self.variant.pk)])
        summary = self.client.get(reverse('stock-levels-summary')).data
        self.assertEqual((summary['negative'], summary['out_of_stock']), (1, 0))

        self.post('stock-entries', {'lines': [
            {'variant': str(self.variant.pk), 'quantity': '5'},
        ]})
        self.assertEqual(self.stock(self.variant), 3)
        summary = self.client.get(reverse('stock-levels-summary')).data
        self.assertEqual(summary['negative'], 0)


class StockExitTest(_StockApiCase):
    def test_exit_beyond_stock_refused_and_nothing_recorded(self):
        other = _variant(self.shop, 'Autre')
        create_movement(self.shop, self.variant, 'in', 5, created_by=self.user)
        create_movement(self.shop, other, 'in', 1, created_by=self.user)
        response = self.post('stock-exits', {'reason': 'breakage', 'lines': [
            {'variant': str(self.variant.pk), 'quantity': '2'},
            {'variant': str(other.pk), 'quantity': '3'},
        ]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['lines'][0], {})
        self.assertIn('1 disponible', response.data['errors']['lines'][1]['quantity'][0])  # noqa: E501
        self.assertEqual((self.stock(self.variant), self.stock(other)), (5, 1))

    def test_exit_records_reason_and_note(self):
        create_movement(self.shop, self.variant, 'in', 5, created_by=self.user)
        response = self.post('stock-exits', {
            'reason': 'internal_use', 'note': 'Vitrine',
            'lines': [{'variant': str(self.variant.pk), 'quantity': '2'}],
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        [movement] = response.data['movements']
        self.assertEqual(
            (movement['movement_type'], movement['reason'], movement['signed_quantity']),  # noqa: E501
            ('internal_use', 'Vitrine', '-2.000'),
        )
        self.assertEqual(self.stock(self.variant), 3)

    def test_unknown_reason_refused(self):
        response = self.post('stock-exits', {
            'reason': 'reservation',
            'lines': [{'variant': str(self.variant.pk), 'quantity': '1'}],
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class StockAdjustmentTest(_StockApiCase):
    def setUp(self):
        super().setUp()
        create_movement(self.shop, self.variant, 'in', 5, created_by=self.user)

    def adjust(self, *lines):
        return self.post('stock-adjustments', {
            'lines': [
                {'variant': str(variant.pk), 'counted_quantity': counted}
                for variant, counted in lines
            ],
            'note': 'Inventaire',
        })

    def test_positive_gap(self):
        response = self.adjust((self.variant, '8'))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['movements'][0]['signed_quantity'], '3.000')
        self.assertEqual(self.stock(self.variant), 8)

    def test_negative_gap(self):
        response = self.adjust((self.variant, '2'))
        self.assertEqual(response.data['movements'][0]['signed_quantity'], '-3.000')
        self.assertEqual(self.stock(self.variant), 2)

    def test_regularises_negative_stock(self):
        create_movement(self.shop, self.variant, 'reservation', 7, created_by=self.user)
        self.adjust((self.variant, '0'))
        self.assertEqual(self.stock(self.variant), 0)

    def test_zero_gap_records_nothing(self):
        response = self.adjust((self.variant, '5'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['movements'], [])
        self.assertEqual(StockMovement.objects.filter(variant=self.variant).count(), 1)

    def test_several_lines_in_one_request(self):
        other = _variant(self.shop, 'Autre')
        create_movement(self.shop, other, 'in', 4, created_by=self.user)
        response = self.adjust((self.variant, '6'), (other, '4'))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['movements']), 1)
        self.assertEqual((self.stock(self.variant), self.stock(other)), (6, 4))

    def test_invalid_line_records_nothing(self):
        service = _variant(self.shop, 'Retouche', type_='service')
        response = self.adjust((self.variant, '9'), (service, '1'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['lines'][1]['variant'], ['Format introuvable.'])  # noqa: E501
        self.assertEqual(self.stock(self.variant), 5)

    def test_failure_on_a_later_line_rolls_back_the_first(self):
        other = _variant(self.shop, 'Autre')
        real = services.create_movement
        calls = []

        def failing(*args, **kwargs):
            calls.append(args)
            if len(calls) == 2:
                raise RuntimeError('panne')
            return real(*args, **kwargs)

        with patch.object(services, 'create_movement', failing), \
                self.assertRaises(RuntimeError):
            services.adjust_to_counts(self.shop, self.user, [
                services.CountLine(self.variant, Decimal('9')),
                services.CountLine(other, Decimal('2')),
            ])
        self.assertEqual((self.stock(self.variant), self.stock(other)), (5, 0))
        self.assertEqual(StockMovement.objects.filter(variant=self.variant).count(), 1)

    def test_same_format_twice_refused(self):
        response = self.adjust((self.variant, '1'), (self.variant, '2'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.stock(self.variant), 5)


class StockEntryTest(_StockApiCase):
    def test_multi_line_entry_with_reference_and_purchase_price(self):
        other = _variant(self.shop, 'Autre', purchase='4.00')
        response = self.post('stock-entries', {
            'supplier_name': 'Lin & Co', 'invoice_number': 'F-118',
            'invoice_date': '2026-10-08',
            'lines': [
                {'variant': str(self.variant.pk), 'quantity': '10',
                 'unit_purchase_price': '3.50'},
                {'variant': str(other.pk), 'quantity': '2'},
            ],
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual((self.stock(self.variant), self.stock(other)), (10, 2))
        self.assertEqual(str(self.variant.purchase_price), '3.50')
        other.refresh_from_db()
        self.assertEqual(str(other.purchase_price), '4.00')
        movement = response.data['movements'][0]
        self.assertEqual(
            (movement['supplier_name'], movement['invoice_number'],
             movement['unit_purchase_price']),
            ('Lin & Co', 'F-118', '3.50'),
        )

    def test_all_or_nothing(self):
        _, _, _, foreign = setup('foreign-entry@example.com')
        response = self.post('stock-entries', {'lines': [
            {'variant': str(self.variant.pk), 'quantity': '10'},
            {'variant': str(foreign.pk), 'quantity': '2'},
        ]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['errors']['lines'][1]['variant'], ['Format introuvable.'],
        )
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_rollback_when_a_later_line_fails(self):
        from unittest import mock

        from . import services

        other = _variant(self.shop, 'Autre')
        real = services.create_movement
        calls = []

        def failing(*args, **kwargs):
            calls.append(1)
            if len(calls) == 2:
                raise RuntimeError('panne')
            return real(*args, **kwargs)

        with mock.patch.object(services, 'create_movement', side_effect=failing):
            with self.assertRaises(RuntimeError):
                services.create_entry(self.shop, self.user, [
                    services.EntryLine(self.variant, 5, None),
                    services.EntryLine(other, 5, None),
                ], services.EntryReference())
        self.assertEqual(StockMovement.objects.count(), 0)
        self.assertEqual(self.stock(self.variant), 0)

    def test_service_format_refused(self):
        service = _variant(self.shop, 'Retouche', type_='service')
        response = self.post('stock-entries', {'lines': [
            {'variant': str(service.pk), 'quantity': '1'},
        ]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class StockLevelsTest(_StockApiCase):
    """Niveaux : un format par état, tris, filtres, résumé et facettes cohérents."""

    def setUp(self):
        super().setUp()
        self.variant.delete()
        self.product.delete()
        self.neg = _variant(self.shop, 'Babouches', purchase='5.00', barcode='111')
        self.out = _variant(self.shop, 'Ceinture', purchase='2.00')
        self.low = _variant(self.shop, 'Djellaba', purchase='20.00', threshold=5)
        self.ok = _variant(self.shop, 'Abaya', sku='ABA-1')
        create_movement(self.shop, self.neg, 'reservation', 2, created_by=self.user)
        create_movement(self.shop, self.low, 'in', 3, created_by=self.user)
        create_movement(self.shop, self.ok, 'in', 9, created_by=self.user)
        service = _variant(self.shop, 'Retouche', type_='service')
        inactive = _variant(self.shop, 'Ancien')
        inactive.product.is_active = False
        inactive.product.save()
        self.assertTrue(service and inactive)

    def ids(self, **params):
        data = self.client.get(reverse('stock-levels'), params).data
        return [row['id'] for row in data['results']]

    def test_one_row_per_tracked_format_sorted_by_stock(self):
        self.assertEqual(
            self.ids(),
            [str(v.pk) for v in (self.neg, self.out, self.low, self.ok)],
        )
        self.assertEqual(self.ids(ordering='-stock')[0], str(self.ok.pk))

    def test_other_sorts(self):
        self.assertEqual(self.ids(ordering='name')[0], str(self.ok.pk))
        # Valeur d'achat : 60 (faible), 0 (rupture) ; sans valeur en fin, par nom.
        self.assertEqual(
            self.ids(ordering='-purchase_value'),
            [str(v.pk) for v in (self.low, self.out, self.ok, self.neg)],
        )
        self.assertEqual(self.ids(ordering='-last_movement')[0], str(self.ok.pk))

    def test_state_filter_and_search(self):
        for state, variant in (('negative', self.neg), ('out', self.out),
                               ('low', self.low), ('in', self.ok)):
            self.assertEqual(self.ids(state=state), [str(variant.pk)], state)
        self.assertEqual(self.ids(search='111'), [str(self.neg.pk)])
        self.assertEqual(self.ids(search='aba-1'), [str(self.ok.pk)])
        self.assertEqual(self.ids(variant=str(self.low.pk)), [str(self.low.pk)])

    def test_row_fields(self):
        row = self.client.get(reverse('stock-levels'), {'state': 'low'}).data['results'][0]  # noqa: E501
        self.assertEqual(
            (row['product_name'], row['state'], row['purchase_value']),
            ('Djellaba', 'low', '60.00'),
        )
        neg = self.client.get(reverse('stock-levels'), {'state': 'negative'}).data
        self.assertIsNone(neg['results'][0]['purchase_value'])

    def test_pagination(self):
        data = self.client.get(reverse('stock-levels'), {'page_size': 3}).data
        self.assertEqual((data['count'], len(data['results'])), (4, 3))
        self.assertIsNotNone(data['next'])

    def test_summary_and_facets_match_the_list(self):
        summary = self.client.get(reverse('stock-levels-summary')).data
        self.assertEqual(summary, {
            'formats': 4, 'negative': 1, 'out_of_stock': 1, 'low_stock': 1,
            'purchase_value': '60.00',
        })
        facets = self.client.get(reverse('stock-levels-facets'), {'state': 'low'}).data
        self.assertEqual(
            facets['state'], {'all': 4, 'negative': 1, 'out': 1, 'low': 1, 'in': 1},
        )
        for state, count in facets['state'].items():
            params = {} if state == 'all' else {'state': state}
            self.assertEqual(len(self.ids(**params)), count, state)
        searched = self.client.get(reverse('stock-levels-facets'), {'search': 'ceint'})
        self.assertEqual(searched.data['state']['all'], 1)


class StockMovementHistoryTest(_StockApiCase):
    def setUp(self):
        super().setUp()
        from apps.orders import services as orders

        create_movement(
            self.shop, self.variant, 'in', 10, created_by=self.user,
            reference=EntryReference('Lin & Co', 'F-118'),
        )
        self.order = orders.create_order(self.shop, self.user)
        orders.add_item(self.order, self.variant, 2, user=self.user)
        orders.reserve_stock(self.order, self.user)
        create_movement(self.shop, self.variant, 'breakage', 1, 'Coutures',
                        created_by=self.user)
        self.other = _variant(self.shop, 'Ceinture')
        create_movement(self.shop, self.other, 'adjustment', 4, 'Inventaire',
                        created_by=self.user)

    def get(self, **params):
        return self.client.get(reverse('stock-movements'), params).data

    def test_type_groups(self):
        types = {
            group: [m['movement_type'] for m in self.get(type=group)['results']]
            for group in ('in', 'out', 'reservation', 'adjustment')
        }
        self.assertEqual(types, {
            'in': ['in'], 'out': ['breakage'], 'reservation': ['reservation'],
            'adjustment': ['adjustment'],
        })

    def test_author_reason_and_references(self):
        rows = {m['movement_type']: m for m in self.get()['results']}
        self.assertEqual(rows['reservation']['order_number'], self.order.order_number)
        self.assertEqual(rows['in']['supplier_name'], 'Lin & Co')
        self.assertEqual(rows['breakage']['reason'], 'Coutures')
        self.assertEqual(rows['in']['author_name'], 'c4')

    def test_filters_product_variant_search_period(self):
        self.assertEqual(self.get(product=str(self.other.product_id))['count'], 1)
        self.assertEqual(self.get(variant=str(self.variant.pk))['count'], 3)
        self.assertEqual(self.get(search='lin & co')['count'], 1)
        self.assertEqual(self.get(period='today')['count'], 4)
        StockMovement.objects.filter(movement_type='in').update(
            created_at=timezone.now() - timedelta(days=40),
        )
        self.assertEqual(self.get(period='30d')['count'], 3)

    def test_sorted_by_date(self):
        newest = [m['movement_type'] for m in self.get()['results']]
        oldest = [m['movement_type'] for m in self.get(ordering='created_at')['results']]  # noqa: E501
        self.assertEqual(newest[0], 'adjustment')
        self.assertEqual(oldest, list(reversed(newest)))

    def test_invalid_variant_filter(self):
        response = self.client.get(reverse('stock-movements'), {'variant': 'abc'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class StockMultiTenantTest(_StockApiCase):
    """Chaque endpoint ignore ou refuse les formats d'une autre boutique."""

    def setUp(self):
        super().setUp()
        self.other_user, _, _, self.foreign = setup('voisin@example.com')
        create_movement(self.foreign.shop, self.foreign, 'in', 5,
                        created_by=self.other_user)

    def test_reads_are_scoped(self):
        levels = self.client.get(reverse('stock-levels')).data
        self.assertEqual([r['id'] for r in levels['results']], [str(self.variant.pk)])
        self.assertEqual(self.client.get(reverse('stock-levels-summary')).data['formats'], 1)  # noqa: E501
        facets = self.client.get(reverse('stock-levels-facets')).data
        self.assertEqual(facets['state']['all'], 1)
        foreign_level = self.client.get(
            reverse('stock-levels'), {'variant': str(self.foreign.pk)},
        ).data
        self.assertEqual(foreign_level['count'], 0)
        movements = self.client.get(
            reverse('stock-movements'), {'variant': str(self.foreign.pk)},
        ).data
        self.assertEqual(movements['count'], 0)

    def test_writes_refuse_a_foreign_format(self):
        line = {'variant': str(self.foreign.pk), 'quantity': '1'}
        for name, data in (
            ('stock-entries', {'lines': [line]}),
            ('stock-exits', {'lines': [line], 'reason': 'loss'}),
            ('stock-adjustments', {'lines': [{'variant': line['variant'], 'counted_quantity': '0'}]}),  # noqa: E501
            ('stock-in', {**line, 'reason': 'x'}),
            ('stock-out', {**line, 'reason': 'x'}),
        ):
            self.assertEqual(self.post(name, data).status_code, 400, name)
        self.assertEqual(self.stock(self.foreign), 5)
