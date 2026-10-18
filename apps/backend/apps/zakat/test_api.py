"""API zakat (lots Z1 et Z2a) : profil, sources, fiches personnelles, écritures conditionnelles."""  # noqa: E501
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.customers.models import Customer
from apps.orders.factories import OrderFactory
from apps.products.models import Product, ProductVariant
from apps.shops.models import Shop, ShopMember
from apps.shops.services import remove_member
from apps.stock.models import StockMovement
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.test_utils import attach_subscription
from . import services
from .models import ZakatCalculation, ZakatProfile

LIST_URL = reverse('zakat-calculation-list')
PROFILE_URL = reverse('zakat-profile')
SOURCES_URL = reverse('zakat-sources')


def _detail(pk) -> str:
    return reverse('zakat-calculation-detail', kwargs={'pk': pk})


def _shop_with_owner(email: str) -> tuple[Shop, User]:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}', currency='EUR')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    return shop, user


def _member(shop: Shop, email: str, role: str = 'admin') -> User:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    ShopMember.objects.create(shop=shop, user=user, role=role)
    return user


def _variant(shop: Shop, name: str, sale: str, purchase: str | None, qty: int) -> ProductVariant:  # noqa: E501
    product = Product.objects.create(shop=shop, name=name)
    variant = ProductVariant.objects.create(
        shop=shop, product=product, packaging_name='Par défaut', unit='piece', base_quantity=1,  # noqa: E501
        selling_price=Decimal(sale), purchase_price=Decimal(purchase) if purchase else None,  # noqa: E501
    )
    StockMovement.objects.create(shop=shop, variant=variant, movement_type='in', quantity=qty)  # noqa: E501
    return variant


def _client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class ZakatAPITestCase(TestCase):
    def setUp(self):
        self.shop, self.owner = _shop_with_owner('owner@example.com')
        self.client = _client(self.owner)

    def _create(self, client: APIClient | None = None, **data):
        return (client or self.client).post(LIST_URL, {'reference_date': '2025-03-01', **data}, format='json')  # noqa: E501


class ProfileTest(ZakatAPITestCase):
    def test_first_read_creates_empty_profile(self):
        response = self.client.get(PROFILE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for name in ('calendar', 'nisab_method', 'stock_valuation', 'receivables_mode', 'debts_mode', 'hawl_date'):  # noqa: E501
            self.assertIsNone(response.data[name])
        self.assertEqual(response.data['ownership_share'], '100.00')
        self.client.get(PROFILE_URL)
        self.assertEqual(ZakatProfile.objects.filter(shop=self.shop, user=self.owner).count(), 1)  # noqa: E501

    def test_patch_choices_and_price_date(self):
        response = self.client.patch(PROFILE_URL, {
            'calendar': 'hijri', 'hawl_date': '2026-02-18', 'nisab_method': 'gold',
            'nisab_unit_price': '110.00', 'stock_valuation': 'purchase',
            'receivables_mode': 'on_collection', 'debts_mode': 'none', 'ownership_share': '50',  # noqa: E501
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['debts_mode'], 'none')
        self.assertIsNotNone(response.data['nisab_price_updated_at'])
        self.assertIsNotNone(response.data['next_hawl'])
        # Prix effacé → date de saisie effacée.
        response = self.client.patch(PROFILE_URL, {'nisab_unit_price': None}, format='json')  # noqa: E501
        self.assertIsNone(response.data['nisab_price_updated_at'])

    def test_reminder_email_on_by_default_and_can_be_turned_off(self):
        self.assertIs(self.client.get(PROFILE_URL).data['reminder_email_enabled'], True)
        response = self.client.patch(PROFILE_URL, {'reminder_email_enabled': False}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIs(response.data['reminder_email_enabled'], False)
        response = self.client.patch(PROFILE_URL, {'reminder_email_enabled': None}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_choice_cannot_go_back_to_null(self):
        response = self.client.patch(PROFILE_URL, {'stock_valuation': None}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ownership_share_bounds(self):
        for value in ('0', '100.01', '-5'):
            response = self.client.patch(PROFILE_URL, {'ownership_share': value}, format='json')  # noqa: E501
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, value)

    def test_profile_is_personal(self):
        admin = _member(self.shop, 'admin@example.com')
        self.client.patch(PROFILE_URL, {'calendar': 'hijri'}, format='json')
        response = _client(admin).get(PROFILE_URL)
        self.assertIsNone(response.data['calendar'])

    def test_staff_refused(self):
        staff = _member(self.shop, 'staff@example.com', role='staff')
        for url in (PROFILE_URL, SOURCES_URL, LIST_URL):
            self.assertEqual(_client(staff).get(url).status_code, status.HTTP_403_FORBIDDEN, url)  # noqa: E501


class SourcesTest(ZakatAPITestCase):
    def test_stock_values_and_formats_without_purchase_price(self):
        _variant(self.shop, 'Chemise', '30.00', '12.00', 10)
        no_price = _variant(self.shop, 'Foulard', '15.00', None, 4)
        other_shop, _ = _shop_with_owner('other@example.com')
        _variant(other_shop, 'Ailleurs', '999.00', '999.00', 1)
        response = self.client.get(SOURCES_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['stock_sale_value']), Decimal('360.00'))
        self.assertEqual(Decimal(response.data['stock_purchase_value']), Decimal('120.00'))  # noqa: E501
        self.assertEqual(
            [f['variant_id'] for f in response.data['formats_without_purchase_price']],
            [str(no_price.pk)],
        )

    def test_unpaid_orders_exclude_cancelled_and_paid(self):
        customer = Customer.objects.create(shop=self.shop, name='Karima')
        unpaid = OrderFactory(shop=self.shop, customer=customer, total_amount=Decimal('100.00'))  # noqa: E501
        partial = OrderFactory(
            shop=self.shop, customer=None, payment_status='partial',
            total_amount=Decimal('80.00'), amount_paid=Decimal('30.00'),
        )
        OrderFactory(shop=self.shop, customer=None, status='cancelled', total_amount=Decimal('50.00'))  # noqa: E501
        OrderFactory(
            shop=self.shop, customer=None, payment_status='paid',
            total_amount=Decimal('40.00'), amount_paid=Decimal('40.00'),
        )
        other_shop, _ = _shop_with_owner('other@example.com')
        OrderFactory(shop=other_shop, customer=None, total_amount=Decimal('70.00'))
        response = self.client.get(SOURCES_URL)
        orders = {o['order_id']: o for o in response.data['unpaid_orders']}
        self.assertEqual(set(orders), {str(unpaid.pk), str(partial.pk)})
        self.assertEqual(orders[str(unpaid.pk)]['customer_name'], customer.display_name)
        self.assertIsNone(orders[str(partial.pk)]['customer_name'])
        self.assertEqual(Decimal(orders[str(partial.pk)]['remaining']), Decimal('50.00'))  # noqa: E501
        self.assertEqual(Decimal(response.data['unpaid_total']), Decimal('150.00'))


class CalculationTest(ZakatAPITestCase):
    def test_create_without_choices_reports_missing(self):
        response = self._create(cash_amount='5000.00')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['hawl_calendar'], 'gregorian')
        self.assertEqual(response.data['hawl_year'], 2025)
        self.assertEqual(response.data['version'], 1)
        totals = response.data['totals']
        self.assertEqual(totals['status'], 'choice_missing')
        self.assertEqual(totals['missing_choices'], list(services.CHOICE_FIELDS))

    def test_create_with_lines_and_complete_profile(self):
        _variant(self.shop, 'Chemise', '30.00', '12.00', 10)
        self.client.patch(PROFILE_URL, {
            'calendar': 'hijri', 'nisab_method': 'gold', 'nisab_unit_price': '100.00',
            'stock_valuation': 'sale', 'receivables_mode': 'yearly', 'debts_mode': 'within_12_months',  # noqa: E501
        }, format='json')
        order = OrderFactory(shop=self.shop, customer=None, total_amount=Decimal('200.00'))  # noqa: E501
        response = self._create(
            cash_amount='9000.00', stock_extra='140.00',
            receivable_items=[{'order_id': str(order.pk), 'label': 'Commande', 'amount': '200.00'}],  # noqa: E501
            other_assets=[{'category': 'personal_cash', 'label': 'Livret', 'amount': '1000.00', 'counted': True}],  # noqa: E501
            debt_items=[{'category': 'loan', 'label': 'Paiement échelonné', 'amount': '3000.00', 'amount_within_12_months': '600.00'}],  # noqa: E501
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['hawl_calendar'], 'hijri')
        self.assertEqual(response.data['hawl_year'], 1446)
        self.assertEqual(response.data['choices']['debts_mode'], 'within_12_months')
        totals = response.data['totals']
        # 9 000 + (300 + 140) + 200 + 1 000 − 600 = 10 040 ; 2,5 % = 251.
        self.assertEqual(Decimal(totals['base']), Decimal('10040.00'))
        self.assertEqual(Decimal(totals['zakat_total']), Decimal('251.00'))
        self.assertEqual(totals['status'], 'above_nisab')

    def test_line_validation(self):
        invalid = [
            {'cash_amount': '-1'},
            {'receivables_nominal': '-1'},
            {'stock_extra': '-1'},
            {'other_assets': [{'category': 'car', 'label': 'x', 'amount': '1', 'counted': True}]},  # noqa: E501
            {'other_assets': [{'category': 'other', 'label': 'x', 'amount': '1'}]},
            {'receivable_items': [{'label': 'x', 'amount': '-5'}]},
            {'debt_items': [{'category': 'supplier', 'label': 'x', 'amount': '10', 'amount_within_12_months': '11'}]},  # noqa: E501
        ]
        for data in invalid:
            self.assertEqual(self._create(**data).status_code, status.HTTP_400_BAD_REQUEST, data)  # noqa: E501
        self.assertFalse(ZakatCalculation.objects.exists())

    def test_receivable_order_must_belong_to_shop_once(self):
        other_shop, _ = _shop_with_owner('other@example.com')
        foreign = OrderFactory(shop=other_shop, customer=None, total_amount=Decimal('10'))  # noqa: E501
        response = self._create(receivable_items=[{'order_id': str(foreign.pk), 'label': 'x', 'amount': '10'}])  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        own = OrderFactory(shop=self.shop, customer=None, total_amount=Decimal('10'))
        line = {'order_id': str(own.pk), 'label': 'x', 'amount': '10'}
        response = self._create(receivable_items=[line, line])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_legacy_debts_breakdown_mapped_to_debt_items(self):
        response = self._create(debts_breakdown=[
            {'category': 'supplier', 'label': 'Fournisseur', 'amount': '200.00', 'is_immediately_due': True},  # noqa: E501
            {'category': 'loan', 'label': 'Paiement échelonné', 'amount': '900.00', 'is_immediately_due': False},  # noqa: E501
        ])
        self.assertEqual(
            [(d['amount'], d['amount_within_12_months']) for d in response.data['debt_items']],  # noqa: E501
            [('200.00', '200.00'), ('900.00', '0.00')],
        )


class DuplicateYearTest(ZakatAPITestCase):
    def test_same_gregorian_year_conflicts(self):
        first = self._create()
        response = self._create(reference_date='2025-12-31')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['existing_id'], first.data['id'])
        self.assertEqual(response.data['hawl_calendar'], 'gregorian')

    def test_hijri_year_spans_two_gregorian_years(self):
        self.client.patch(PROFILE_URL, {'calendar': 'hijri'}, format='json')
        # 1447 H : du 2025-06-26 au 2026-06-15 environ.
        first = self._create(reference_date='2025-08-01')
        self.assertEqual(first.data['hawl_year'], 1447)
        response = self._create(reference_date='2026-03-01')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['hawl_year'], 1447)
        self.assertEqual(self._create(reference_date='2026-08-01').status_code, status.HTTP_201_CREATED)  # noqa: E501

    def test_patch_to_taken_year_conflicts(self):
        first = self._create()
        second = self._create(reference_date='2024-03-01')
        response = self.client.patch(_detail(second.data['id']), {'reference_date': '2025-06-01', 'version': 1}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['existing_id'], first.data['id'])
        self.assertEqual(ZakatCalculation.objects.get(pk=second.data['id']).hawl_year, 2024)  # noqa: E501

    def test_two_admins_same_year(self):
        admin = _member(self.shop, 'admin@example.com')
        self.assertEqual(self._create().status_code, status.HTTP_201_CREATED)
        self.assertEqual(self._create(_client(admin)).status_code, status.HTTP_201_CREATED)  # noqa: E501


class VersionTest(ZakatAPITestCase):
    def test_stale_version_conflicts(self):
        calc_id = self._create().data['id']
        ok = self.client.patch(_detail(calc_id), {'cash_amount': '10', 'version': 1}, format='json')  # noqa: E501
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.data['version'], 2)
        stale = self.client.patch(_detail(calc_id), {'cash_amount': '20', 'version': 1}, format='json')  # noqa: E501
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(stale.data['current_version'], 2)
        self.assertEqual(ZakatCalculation.objects.get(pk=calc_id).cash_amount, Decimal('10.00'))  # noqa: E501

    def test_concurrent_write_lost_between_read_and_update(self):
        # La fiche change entre la lecture et l'UPDATE : la condition sur la version
        # ne touche aucune ligne → 409, jamais d'écrasement silencieux.
        calc = services.create_calculation(self.shop, self.owner, {'reference_date': date(2025, 3, 1)})  # noqa: E501
        ZakatCalculation.objects.filter(pk=calc.pk).update(version=5)
        with self.assertRaises(services.VersionConflictError) as ctx:
            services.update_calculation(calc, {'cash_amount': Decimal('1')}, expected_version=1)  # noqa: E501
        self.assertEqual(ctx.exception.current_version, 5)

    def test_patch_without_version_refused(self):
        calc_id = self._create().data['id']
        response = self.client.patch(_detail(calc_id), {'cash_amount': '10'}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['version'][0].code, 'required')
        calc = ZakatCalculation.objects.get(pk=calc_id)
        self.assertEqual((calc.cash_amount, calc.version), (Decimal('0.00'), 1))

    def test_finalize_reopen_and_draft_removed(self):
        calc_id = self._create().data['id']
        for suffix in (f'{calc_id}/finalize/', f'{calc_id}/reopen/'):
            response = self.client.post(f'{LIST_URL}{suffix}')
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, suffix)
        self.assertEqual(self.client.get(f'{LIST_URL}draft/').status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501


class IsolationTest(ZakatAPITestCase):
    def test_other_admin_of_same_shop_gets_404(self):
        calc_id = self._create().data['id']
        admin = _client(_member(self.shop, 'admin@example.com'))
        self.assertEqual(admin.get(_detail(calc_id)).status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501
        self.assertEqual(admin.patch(_detail(calc_id), {'cash_amount': '1', 'version': 1}, format='json').status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501
        self.assertEqual(admin.delete(_detail(calc_id)).status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501
        pdf = admin.get(reverse('zakat-calculation-pdf', kwargs={'pk': calc_id}))
        self.assertEqual(pdf.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(admin.get(LIST_URL).data['count'], 0)

    def test_other_shop_gets_404(self):
        calc_id = self._create().data['id']
        _, other_owner = _shop_with_owner('other@example.com')
        other = _client(other_owner)
        self.assertEqual(other.get(_detail(calc_id)).status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501
        self.assertEqual(other.get(LIST_URL).data['count'], 0)

    def test_two_admins_at_half_share(self):
        _variant(self.shop, 'Chemise', '100.00', '60.00', 100)  # 10 000 au prix de vente  # noqa: E501
        admin = _client(_member(self.shop, 'admin@example.com'))
        choices = {
            'calendar': 'hijri', 'nisab_method': 'gold', 'nisab_unit_price': '50.00',
            'stock_valuation': 'sale', 'receivables_mode': 'yearly', 'debts_mode': 'all',  # noqa: E501
            'ownership_share': '50',
        }
        totals = []
        for client in (self.client, admin):
            client.patch(PROFILE_URL, choices, format='json')
            response = self._create(
                client, cash_amount='4000.00',
                other_assets=[{'category': 'personal_cash', 'label': 'Livret', 'amount': '1000.00', 'counted': True}],  # noqa: E501
                debt_items=[{'category': 'supplier', 'label': 'Fournisseur', 'amount': '2000.00', 'amount_within_12_months': '2000.00'}],  # noqa: E501
            )
            totals.append(response.data['totals'])
        for t in totals:
            # (4 000 + 10 000 − 2 000) × 50 % + 1 000 de biens personnels = 7 000.
            self.assertEqual(Decimal(t['base']), Decimal('7000.00'))
            self.assertEqual(Decimal(t['zakat_total']), Decimal('175.00'))


class StockRefreshTest(ZakatAPITestCase):
    def setUp(self):
        super().setUp()
        self.variant = _variant(self.shop, 'Chemise', '10.00', '5.00', 10)

    def _add_stock(self, qty: int) -> None:
        StockMovement.objects.create(shop=self.shop, variant=self.variant, movement_type='in', quantity=qty)  # noqa: E501

    def test_stock_follows_until_reference_date(self):
        future = (services.shop_today(self.shop) + timedelta(days=10)).isoformat()
        calc_id = self._create(reference_date=future).data['id']
        self._add_stock(10)
        response = self.client.patch(_detail(calc_id), {'cash_amount': '1', 'version': 1}, format='json')  # noqa: E501
        self.assertEqual(Decimal(response.data['stock_sale_value']), Decimal('200.00'))

    def test_stock_frozen_after_reference_date_unless_asked(self):
        calc_id = self._create(reference_date='2025-03-01').data['id']
        self._add_stock(10)
        response = self.client.patch(_detail(calc_id), {'cash_amount': '1', 'version': 1}, format='json')  # noqa: E501
        self.assertEqual(Decimal(response.data['stock_sale_value']), Decimal('100.00'))
        response = self.client.patch(_detail(calc_id), {'refresh_stock': True, 'version': 2}, format='json')  # noqa: E501
        self.assertEqual(Decimal(response.data['stock_sale_value']), Decimal('200.00'))
        self.assertEqual(Decimal(response.data['stock_purchase_value']), Decimal('100.00'))  # noqa: E501


class AuditTest(ZakatAPITestCase):
    def _actions(self) -> list[str]:
        return list(AuditLog.objects.filter(shop_id=self.shop.pk).order_by('created_at').values_list('action', flat=True))  # noqa: E501

    def test_create_pdf_and_delete_are_logged_without_amounts(self):
        calc_id = self._create(cash_amount='12345.67').data['id']
        pdf = self.client.get(reverse('zakat-calculation-pdf', kwargs={'pk': calc_id}))
        self.assertEqual(pdf.status_code, status.HTTP_200_OK)
        self.client.delete(_detail(calc_id))
        self.assertEqual(self._actions(), ['zakat_created', 'zakat_pdf_download', 'zakat_deleted'])  # noqa: E501
        for log in AuditLog.objects.filter(shop_id=self.shop.pk):
            self.assertNotIn('12345', f'{log.object_repr} {log.changes}')
            self.assertEqual(log.user, self.owner)

    def test_pdf_refused_to_other_admin_not_logged(self):
        calc_id = self._create().data['id']
        admin = _client(_member(self.shop, 'admin@example.com'))
        pdf = admin.get(reverse('zakat-calculation-pdf', kwargs={'pk': calc_id}))
        self.assertEqual(pdf.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self._actions(), ['zakat_created'])


class MemberRemovalTest(ZakatAPITestCase):
    def setUp(self):
        super().setUp()
        self.admin = _member(self.shop, 'admin@example.com')
        for user in (self.owner, self.admin):
            services.get_or_create_profile(self.shop, user)
            services.create_calculation(self.shop, user, {'reference_date': date(2025, 3, 1)})  # noqa: E501

    def test_removal_deletes_member_zakat_data_only(self):
        remove_member(ShopMember.objects.get(shop=self.shop, user=self.admin))
        self.assertFalse(ZakatProfile.objects.filter(user=self.admin).exists())
        self.assertFalse(ZakatCalculation.objects.filter(user=self.admin).exists())
        self.assertTrue(ZakatProfile.objects.filter(user=self.owner).exists())
        self.assertTrue(ZakatCalculation.objects.filter(user=self.owner).exists())

    def test_removal_is_atomic(self):
        member = ShopMember.objects.get(shop=self.shop, user=self.admin)
        with patch.object(ShopMember, 'delete', side_effect=RuntimeError('échec')):
            with self.assertRaises(RuntimeError):
                remove_member(member)
        self.assertTrue(ZakatProfile.objects.filter(user=self.admin).exists())
        self.assertTrue(ZakatCalculation.objects.filter(user=self.admin).exists())
