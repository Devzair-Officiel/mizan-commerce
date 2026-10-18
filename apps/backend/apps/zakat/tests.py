from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember  # noqa: F401
from apps.products.models import Product, ProductVariant
from apps.stock.models import StockMovement
from .models import ZakatCalculation
from . import services


def setup(email: str, currency: str = 'EUR'):
    from apps.subscriptions.test_utils import attach_subscription
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}', currency=currency)
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    attach_subscription(shop)  # Formule Solo par défaut.
    return user, shop


def _calc(shop, user, reference_date: str, **fields) -> ZakatCalculation:
    """Fiche personnelle en année grégorienne, insérée sans passer par le service."""
    return ZakatCalculation.objects.create(
        shop=shop, user=user, reference_date=reference_date,
        hawl_calendar='gregorian', hawl_year=int(reference_date[:4]),
        currency=shop.currency, **fields,
    )


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

    def test_stock_breakdown_overrides_estimated(self):
        _make_product(self.shop, 'Produit A', Decimal('10.00'), Decimal('100.00'), 5)
        # Ventilation manuelle = 4 sous-montants → autoritaire sur estimated/adjusted
        calc = _calc(
            self.shop, self.user, '2025-03-01',
            stock_value_estimated=Decimal('500.00'),
            stock_breakdown=[
                {'category': 'finished', 'amount': '200.00'},
                {'category': 'raw_materials', 'amount': '50.00'},
                {'category': 'work_in_progress', 'amount': '30.00'},
                {'category': 'in_transit', 'amount': '20.00'},
            ],
        )
        self.assertEqual(calc.stock_value_for_base, Decimal('300.00'))

    def test_receivables_breakdown_excludes_doubtful(self):
        # certain + probable entrent dans receivables_amount, doubtful exclus
        total = services.sum_recoverable_receivables([
            {'category': 'certain', 'amount': '100.00'},
            {'category': 'probable', 'amount': '50.00'},
            {'category': 'doubtful', 'amount': '999.00'},
        ])
        self.assertEqual(total, Decimal('150.00'))

    def test_compute_nisab_threshold_silver_default(self):
        # Argent : 595 g × prix unitaire
        self.shop.nisab_method = Shop.NISAB_METHOD_SILVER
        self.shop.nisab_unit_price = Decimal('1.20')
        self.shop.save()
        threshold = services.compute_nisab_threshold(self.shop)
        self.assertEqual(threshold, Decimal('714.00'))

    def test_compute_nisab_threshold_gold(self):
        self.shop.nisab_method = Shop.NISAB_METHOD_GOLD
        self.shop.nisab_unit_price = Decimal('90.00')
        self.shop.save()
        threshold = services.compute_nisab_threshold(self.shop)
        self.assertEqual(threshold, Decimal('7650.00'))  # 85 × 90

    def test_compute_nisab_returns_none_when_unconfigured(self):
        self.assertIsNone(services.compute_nisab_threshold(self.shop))

    def test_second_calculation_same_year_refused_at_creation(self):
        first = services.create_calculation(self.shop, self.user, {'reference_date': date(2025, 3, 1)})  # noqa: E501
        # Autre mois de la même année (pas de calendrier choisi → grégorien).
        with self.assertRaises(services.DuplicateHawlYearError) as ctx:
            services.create_calculation(self.shop, self.user, {'reference_date': date(2025, 9, 15)})  # noqa: E501
        self.assertEqual(ctx.exception.hawl_year, 2025)
        self.assertEqual(ctx.exception.existing_id, first.pk)
        self.assertEqual(ZakatCalculation.objects.filter(shop=self.shop).count(), 1)
        # L'année suivante reste possible.
        services.create_calculation(self.shop, self.user, {'reference_date': date(2026, 3, 1)})  # noqa: E501


class ZakatAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('zakat-api@example.com')
        self.client.force_authenticate(user=self.user)

    def test_stock_estimate_endpoint(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        response = self.client.get(reverse('zakat-stock-estimate'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['stock_value_estimated']), Decimal('80.00'))  # noqa: E501
        self.assertIn('disclaimer', response.data)

    def test_create_calculation_starts_as_draft(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        response = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'draft')
        # Le stock estimé est recalculé même sur un brouillon.
        self.assertEqual(Decimal(response.data['stock_value_estimated']), Decimal('80.00'))  # noqa: E501
        # Base et montant restent à 0 tant que le brouillon n'est pas finalisé.
        self.assertEqual(Decimal(response.data['zakat_base']), Decimal('0.00'))

    def test_patch_draft_updates_fields_and_recomputes_debts(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '100.00',
        }, format='json')
        calc_id = create.data['id']
        patch = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc_id}),
            {
                'version': create.data['version'],
                'current_step': 4,
                'cash_amount': '500.00',
                'debts_breakdown': [
                    {'category': 'supplier', 'label': 'Fournisseur', 'amount': '200.00', 'is_immediately_due': True},  # noqa: E501
                    {'category': 'loan', 'label': 'Paiement échelonné', 'amount': '5000.00', 'is_immediately_due': False},  # noqa: E501
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        # Seule la dette exigible immédiatement entre dans short_term_debts.
        self.assertEqual(Decimal(patch.data['short_term_debts']), Decimal('200.00'))

    def test_create_refuses_second_calc_same_year(self):
        first = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        second = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-09-15',
        }, format='json')
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(second.data['hawl_year'], 2025)
        self.assertEqual(second.data['existing_id'], first.data['id'])

    def test_patch_draft_with_receivables_breakdown_sums_recoverable_only(self):
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        calc_id = create.data['id']
        patch = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc_id}),
            {
                'version': create.data['version'],
                'has_receivables': True,
                'receivables_nominal': '1000.00',
                'receivables_breakdown': [
                    {'category': 'certain', 'amount': '600.00'},
                    {'category': 'probable', 'amount': '200.00'},
                    {'category': 'doubtful', 'amount': '200.00'},
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        # 600 + 200 = 800 (douteuses exclues)
        self.assertEqual(Decimal(patch.data['receivables_amount']), Decimal('800.00'))

    def test_patch_draft_with_stock_breakdown_overrides_estimate(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        calc_id = create.data['id']
        patch = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc_id}),
            {
                'version': create.data['version'],
                'stock_breakdown': [
                    {'category': 'finished', 'amount': '50.00'},
                    {'category': 'raw_materials', 'amount': '20.00'},
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        # estimated reste à 80, mais stock_value_for_base utilise le breakdown
        self.assertEqual(Decimal(patch.data['stock_value_estimated']), Decimal('80.00'))
        self.assertEqual(Decimal(patch.data['stock_value_for_base']), Decimal('70.00'))

    def test_patch_draft_accepts_rent_debt_category(self):
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        calc_id = create.data['id']
        patch = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc_id}),
            {
                'version': create.data['version'],
                'debts_breakdown': [
                    {'category': 'rent', 'label': 'Loyer mars', 'amount': '800.00', 'is_immediately_due': True},  # noqa: E501
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(patch.data['short_term_debts']), Decimal('800.00'))

    def test_list_scoped_to_shop(self):
        user_b, shop_b = setup('b@example.com')
        _calc(shop_b, user_b, '2025-01-01')
        response = self.client.get(reverse('zakat-calculation-list'))
        self.assertEqual(response.data['count'], 0)

    def test_multitenant_isolation(self):
        user_b, shop_b = setup('c@example.com')
        calc = _calc(shop_b, user_b, '2025-01-01')
        response = self.client.get(reverse('zakat-calculation-detail', kwargs={'pk': calc.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pdf_endpoint_returns_pdf_for_draft(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        calc_id = create.data['id']
        response = self.client.get(reverse('zakat-calculation-pdf', kwargs={'pk': calc_id}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertEqual(response['Content-Disposition'], 'attachment; filename="zakat-2025.pdf"')  # noqa: E501
        # Le PDF doit commencer par la signature standard %PDF-
        self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_delete_calculation(self):
        calc = _calc(self.shop, self.user, '2025-03-01', status='finalized')
        response = self.client.delete(
            reverse('zakat-calculation-detail', kwargs={'pk': calc.pk}),
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ZakatCalculation.objects.filter(pk=calc.pk).exists())

