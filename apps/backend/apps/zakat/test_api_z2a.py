"""API zakat du lot Z2a : choix propres à la fiche, prochain jour J, création
préremplie, repères de l'écran (commandes liées, fiche la plus récente), sources,
bijoux.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from hijridate import Hijri
from rest_framework import status

from apps.customers.models import Customer
from apps.orders.factories import OrderFactory
from apps.orders.models import Order
from . import services
from .models import ZakatCalculation, ZakatProfile
from .test_api import LIST_URL, PROFILE_URL, SOURCES_URL, ZakatAPITestCase, _detail, _variant  # noqa: E501

COMPLETE_CHOICES = {
    'calendar': 'hijri', 'nisab_method': 'gold', 'nisab_unit_price': '100.00',
    'stock_valuation': 'sale', 'receivables_mode': 'yearly', 'debts_mode': 'within_12_months',  # noqa: E501
}


def _today(day: date):
    return patch('apps.zakat.services.shop_today', return_value=day)


class FicheChoicesTest(ZakatAPITestCase):
    """Les choix appartiennent à la fiche ; le profil suit la fiche la plus récente."""

    def setUp(self):
        super().setUp()
        self.client.patch(PROFILE_URL, {**COMPLETE_CHOICES, 'hawl_date': '2024-03-11'}, format='json')  # noqa: E501
        self.y1446 = self._create(reference_date='2025-03-01').data
        self.y1447 = self._create(reference_date='2025-08-01').data

    def _patch_choices(self, calc: dict, **choices):
        return self.client.patch(
            _detail(calc['id']), {'choices': choices, 'version': calc['version']}, format='json',  # noqa: E501
        )

    def test_older_calculation_changes_neither_profile_nor_newer(self):
        response = self._patch_choices(self.y1446, stock_valuation='purchase')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['choices']['stock_valuation'], 'purchase')
        self.assertEqual(ZakatProfile.objects.get(user=self.owner).stock_valuation, 'sale')  # noqa: E501
        newer = ZakatCalculation.objects.get(pk=self.y1447['id'])
        self.assertEqual(newer.choices_snapshot['stock_valuation'], 'sale')
        self.assertEqual(newer.version, 1)

    def test_latest_calculation_updates_profile_except_hawl_date(self):
        response = self._patch_choices(self.y1447, debts_mode='all', ownership_share='50')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        profile = ZakatProfile.objects.get(user=self.owner)
        self.assertEqual((profile.debts_mode, profile.ownership_share), ('all', Decimal('50.00')))  # noqa: E501
        self.assertEqual(profile.hawl_date, date(2024, 3, 11))
        # Clés non envoyées : inchangées dans la fiche comme dans le profil.
        self.assertEqual(response.data['choices']['stock_valuation'], 'sale')
        self.assertEqual(profile.stock_valuation, 'sale')

    def test_profile_change_does_not_touch_existing_calculations(self):
        self.client.patch(PROFILE_URL, {'debts_mode': 'none'}, format='json')
        detail = self.client.get(_detail(self.y1447['id'])).data
        self.assertEqual(detail['choices']['debts_mode'], 'within_12_months')

    def test_price_change_dates_calculation_and_profile(self):
        response = self._patch_choices(self.y1447, nisab_unit_price='120.00')
        stamp = response.data['choices']['nisab_price_updated_at']
        self.assertIsNotNone(stamp)
        self.assertEqual(Decimal(response.data['totals']['nisab_threshold']), Decimal('10200.00'))  # noqa: E501
        profile = ZakatProfile.objects.get(user=self.owner)
        self.assertEqual(profile.nisab_unit_price, Decimal('120.00'))
        self.assertEqual(profile.nisab_price_updated_at.isoformat(), stamp)

    def test_choice_cannot_be_unset(self):
        response = self._patch_choices(self.y1447, calendar=None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self._patch_choices(self.y1447, ownership_share='0')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_calendar_change_recomputes_year(self):
        response = self._patch_choices(self.y1447, calendar='gregorian')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['hawl_calendar'], response.data['hawl_year']), ('gregorian', 2025))  # noqa: E501
        self.assertEqual(Decimal(response.data['totals']['rate']), Decimal('0.025775'))
        self.assertEqual(ZakatProfile.objects.get(user=self.owner).calendar, 'gregorian')  # noqa: E501

    def test_calendar_change_to_taken_year_conflicts_without_any_write(self):
        self._patch_choices(self.y1446, calendar='gregorian')  # 1446 → 2025
        response = self._patch_choices(self.y1447, calendar='gregorian')  # 2025 pris
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['existing_id'], self.y1446['id'])
        calc = ZakatCalculation.objects.get(pk=self.y1447['id'])
        self.assertEqual((calc.hawl_calendar, calc.hawl_year, calc.version), ('hijri', 1447, 1))  # noqa: E501
        self.assertEqual(ZakatProfile.objects.get(user=self.owner).calendar, 'hijri')


class NextHawlTest(ZakatAPITestCase):
    def _next(self, hawl_date: str, calendar: str, today: date) -> dict:
        self.client.patch(PROFILE_URL, {'hawl_date': hawl_date, 'calendar': calendar}, format='json')  # noqa: E501
        with _today(today):
            return self.client.get(PROFILE_URL).data['next_hawl']

    def test_gregorian_days_remaining_and_cycle(self):
        info = self._next('2024-03-10', 'gregorian', date(2026, 3, 1))
        self.assertEqual(info['date'], '2026-03-10')
        self.assertEqual((info['days_remaining'], info['cycle_length']), (9, 365))
        self.assertEqual((info['hawl_calendar'], info['hawl_year']), ('gregorian', 2026))  # noqa: E501
        self.assertIsNone(info['calculation_id'])

    def test_hawl_day_is_today(self):
        info = self._next('2024-03-10', 'gregorian', date(2026, 3, 10))
        self.assertEqual((info['date'], info['days_remaining']), ('2026-03-10', 0))

    def test_february_29(self):
        info = self._next('2024-02-29', 'gregorian', date(2025, 1, 10))
        self.assertEqual(info['date'], '2025-02-28')
        self.assertEqual(info['cycle_length'], 365)

    def test_hijri_with_existing_calculation(self):
        self.client.patch(PROFILE_URL, {'calendar': 'hijri'}, format='json')
        upcoming = Hijri(1447, 9, 1).to_gregorian()
        calc_id = self._create(reference_date=upcoming.isoformat()).data['id']
        info = self._next('2025-03-01', 'hijri', date(2025, 12, 1))  # 1er ramadan 1446
        self.assertEqual(info['date'], upcoming.isoformat())
        self.assertEqual(info['hijri'], {'year': 1447, 'month': 9, 'day': 1})
        self.assertEqual(info['hawl_year'], 1447)
        self.assertIn(info['cycle_length'], (354, 355))
        self.assertEqual(info['calculation_id'], calc_id)

    def test_none_without_calendar_and_threshold_exposed(self):
        self.client.patch(PROFILE_URL, {'hawl_date': '2024-03-10', 'nisab_method': 'silver', 'nisab_unit_price': '1.00'}, format='json')  # noqa: E501
        data = self.client.get(PROFILE_URL).data
        self.assertIsNone(data['next_hawl'])
        self.assertEqual(data['nisab_threshold'], '595.00')


class CreationTest(ZakatAPITestCase):
    def test_reference_date_defaults_to_next_hawl_then_today(self):
        with _today(date(2026, 1, 5)):
            self.assertEqual(self.client.post(LIST_URL, {}, format='json').data['reference_date'], '2026-01-05')  # noqa: E501
        self.client.patch(PROFILE_URL, {'hawl_date': '2024-03-10', 'calendar': 'gregorian'}, format='json')  # noqa: E501
        with _today(date(2026, 12, 1)):
            response = self.client.post(LIST_URL, {}, format='json')
        self.assertEqual(response.data['reference_date'], '2027-03-10')

    def test_unpaid_orders_copied_as_receivables(self):
        customer = Customer.objects.create(shop=self.shop, name='Karima')
        named = OrderFactory(shop=self.shop, customer=customer, total_amount=Decimal('310.00'))  # noqa: E501
        anonymous = OrderFactory(
            shop=self.shop, customer=None, payment_status='partial',
            total_amount=Decimal('80.00'), amount_paid=Decimal('30.00'),
        )
        OrderFactory(shop=self.shop, customer=None, status='cancelled', total_amount=Decimal('50.00'))  # noqa: E501
        items = self._create().data['receivable_items']
        self.assertEqual(items, [
            {'order_id': str(named.pk), 'label': customer.display_name, 'amount': '310.00', 'doubtful': False},  # noqa: E501
            {'order_id': str(anonymous.pk), 'label': anonymous.order_number, 'amount': '50.00', 'doubtful': False},  # noqa: E501
        ])
        self.assertEqual(self._create(reference_date='2024-03-01', receivable_items=[]).data['receivable_items'], [])  # noqa: E501

    def test_current_step_bounds(self):
        self.assertEqual(self._create(current_step=7).status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
        self.assertEqual(self._create(current_step=6).data['current_step'], 6)

    def test_list_carries_totals_only(self):
        self._create(cash_amount='100.00')
        row = self.client.get(LIST_URL).data['results'][0]
        self.assertEqual(set(row), {
            'id', 'reference_date', 'reference_hijri', 'hawl_calendar', 'hawl_year',
            'current_step', 'currency', 'updated_at', 'totals',
        })
        self.assertEqual(Decimal(row['totals']['cash']), Decimal('100.00'))


class ReceivableReviewTest(ZakatAPITestCase):
    def setUp(self):
        super().setUp()
        self.orders = {
            name: OrderFactory(shop=self.shop, customer=None, total_amount=Decimal('310.00'))  # noqa: E501
            for name in ('changed', 'settled', 'cancelled', 'removed', 'unchanged')
        }

    def _change_orders(self) -> Order:
        Order.objects.filter(pk=self.orders['changed'].pk).update(amount_paid=Decimal('160.00'), payment_status='partial')  # noqa: E501
        Order.objects.filter(pk=self.orders['settled'].pk).update(amount_paid=Decimal('310.00'), payment_status='paid')  # noqa: E501
        Order.objects.filter(pk=self.orders['cancelled'].pk).update(status='cancelled')
        Order.objects.filter(pk=self.orders['removed'].pk).delete()
        return OrderFactory(shop=self.shop, customer=None, total_amount=Decimal('45.00'))  # noqa: E501

    def _review(self, reference_date: str) -> dict:
        calc_id = self._create(reference_date=reference_date).data['id']
        new_order = self._change_orders()
        review = self.client.get(_detail(calc_id)).data['review']['receivable_orders']
        return {'review': review, 'new_order': new_order}

    def test_live_calculation_flags_each_order(self):
        future = (services.shop_today(self.shop) + timedelta(days=10)).isoformat()
        result = self._review(future)
        linked = {line['order_id']: line for line in result['review']['linked']}
        for name, order in self.orders.items():
            self.assertEqual(linked[str(order.pk)]['state'], name)
        self.assertEqual(Decimal(linked[str(self.orders['changed'].pk)]['remaining']), Decimal('150.00'))  # noqa: E501
        self.assertIsNone(linked[str(self.orders['removed'].pk)]['order_number'])
        self.assertEqual(
            [line['order_id'] for line in result['review']['new']], [str(result['new_order'].pk)],  # noqa: E501
        )

    def test_past_calculation_is_frozen(self):
        result = self._review('2025-03-01')
        self.assertEqual({line['state'] for line in result['review']['linked']}, {'unchanged'})  # noqa: E501
        self.assertEqual(result['review']['new'], [])


class LatestAndHawlDateTest(ZakatAPITestCase):
    def test_hawl_date_differs_only_on_latest(self):
        self.client.patch(PROFILE_URL, {'hawl_date': '2024-03-10', 'calendar': 'gregorian'}, format='json')  # noqa: E501
        on_anniversary = self._create(reference_date='2025-03-10').data
        self.assertEqual(on_anniversary['review']['is_latest'], True)
        self.assertEqual(on_anniversary['review']['hawl_date_differs'], False)
        moved = self._create(reference_date='2026-04-01').data
        self.assertEqual(moved['review']['hawl_date_differs'], True)
        older = self.client.get(_detail(on_anniversary['id'])).data['review']
        self.assertEqual((older['is_latest'], older['hawl_date_differs']), (False, False))  # noqa: E501
        self.client.patch(PROFILE_URL, {'hawl_date': '2026-04-01'}, format='json')
        latest = self.client.get(_detail(moved['id'])).data['review']
        self.assertEqual(latest['hawl_date_differs'], False)

    def test_profile_without_hawl_date_differs(self):
        self.assertEqual(self._create().data['review']['hawl_date_differs'], True)

    def test_is_live_until_reference_date(self):
        today = services.shop_today(self.shop)
        live = self._create(reference_date=today.isoformat()).data['review']
        past = self._create(reference_date='2024-03-01').data['review']
        self.assertEqual((live['is_live'], past['is_live']), (True, False))


class SourcesZ2aTest(ZakatAPITestCase):
    def test_top_stock_lines_by_sale_and_purchase(self):
        for i in range(6):
            _variant(self.shop, f'Article {i}', f'{10 * (i + 1)}.00', f'{60 - 10 * i}.00', 1)  # noqa: E501
        no_price = _variant(self.shop, 'Sans prix', '1000.00', None, 1)
        OrderFactory(shop=self.shop, customer=None, total_amount=Decimal('20.00'))
        data = self.client.get(SOURCES_URL).data
        sale = data['top_stock_lines']['sale']
        self.assertEqual([line['product_name'] for line in sale], ['Sans prix', 'Article 5', 'Article 4', 'Article 3', 'Article 2'])  # noqa: E501
        self.assertEqual(sale[0]['product_id'], str(no_price.product_id))
        self.assertIsNone(sale[0]['purchase_value'])
        self.assertIsNone(sale[0]['purchase_price'])
        self.assertEqual((sale[1]['sale_price'], sale[1]['purchase_price']), ('60.00', '10.00'))  # noqa: E501
        purchase = data['top_stock_lines']['purchase']
        self.assertEqual([line['product_name'] for line in purchase], ['Article 0', 'Article 1', 'Article 2', 'Article 3', 'Article 4'])  # noqa: E501
        self.assertEqual(data['formats_without_purchase_price'][0]['product_id'], str(no_price.product_id))  # noqa: E501
        self.assertIsNotNone(data['unpaid_orders'][0]['created_at'])


class JewelryTest(ZakatAPITestCase):
    def _asset(self, **fields) -> dict:
        return {'category': 'jewelry', 'label': 'Bijoux portés', 'amount': '2000.00', **fields}  # noqa: E501

    def test_counted_must_be_chosen(self):
        response = self._create(other_assets=[self._asset()])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_not_counted_stays_off_base(self):
        response = self._create(other_assets=[
            self._asset(counted=False),
            {'category': 'gold_silver', 'label': 'Lingots, pièces', 'amount': '500.00', 'counted': True},  # noqa: E501
        ])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data['totals']['other_assets']), Decimal('500.00'))  # noqa: E501
        counted = self._create(reference_date='2024-03-01', other_assets=[self._asset(counted=True)])  # noqa: E501
        self.assertEqual(Decimal(counted.data['totals']['other_assets']), Decimal('2000.00'))  # noqa: E501
