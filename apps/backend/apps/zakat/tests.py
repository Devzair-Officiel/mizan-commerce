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
    attach_subscription(shop)  # Plan Pro requis pour les endpoints zakat.
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

    def test_stock_breakdown_overrides_estimated(self):
        _make_product(self.shop, 'Produit A', Decimal('10.00'), Decimal('100.00'), 5)
        # Ventilation manuelle = 4 sous-montants → autoritaire sur estimated/adjusted
        calc = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01',
            stock_value_estimated=Decimal('500.00'),
            stock_breakdown=[
                {'category': 'finished', 'amount': '200.00'},
                {'category': 'raw_materials', 'amount': '50.00'},
                {'category': 'work_in_progress', 'amount': '30.00'},
                {'category': 'in_transit', 'amount': '20.00'},
            ],
            currency='EUR',
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

    def test_finalize_snapshots_nisab_and_flags_above(self):
        self.shop.nisab_method = Shop.NISAB_METHOD_SILVER
        self.shop.nisab_unit_price = Decimal('1.00')  # threshold = 595
        self.shop.save()
        _make_product(self.shop, 'P', Decimal('10'), Decimal('100.00'), 10)  # stock = 1000
        calc = services.calculate_zakat(
            shop=self.shop, reference_date='2024-03-01',
            cash_amount=Decimal('0'),
        )
        # calculate_zakat ne snapshote pas le nisab — c'est finalize_calculation qui le fait.
        # On vérifie via une création + finalize explicite, sur une année différente
        # pour respecter la contrainte d'unicité annuelle.
        draft = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01', currency=self.shop.currency,
        )
        services.finalize_calculation(draft)
        self.assertEqual(draft.nisab_threshold, Decimal('595.00'))
        self.assertEqual(draft.nisab_method, 'silver')
        # Base = stock 1000 > 595 → above nisab
        self.assertTrue(draft.is_above_nisab)
        # Sanity check sur calculate_zakat
        self.assertEqual(calc.zakat_base, Decimal('1000.00'))

    def test_zakat_base_never_negative(self):
        calc = services.calculate_zakat(
            shop=self.shop,
            reference_date='2025-03-01',
            short_term_debts=Decimal('9999.00'),
        )
        self.assertEqual(calc.zakat_base, Decimal('0'))
        self.assertEqual(calc.zakat_amount, Decimal('0.00'))

    def test_finalize_refuses_second_calculation_same_year(self):
        # Première finalisation : OK.
        first = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01', currency=self.shop.currency,
        )
        services.finalize_calculation(first)

        # Deuxième brouillon pour la même année (autre mois) → refus à la finalisation.
        second = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-09-15', currency=self.shop.currency,
        )
        with self.assertRaises(services.YearAlreadyFinalizedError) as ctx:
            services.finalize_calculation(second)
        self.assertEqual(ctx.exception.year, 2025)
        self.assertEqual(ctx.exception.existing_id, first.pk)

        # Une finalisation pour l'année suivante reste possible.
        third = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2026-03-01', currency=self.shop.currency,
        )
        services.finalize_calculation(third)
        self.assertEqual(third.status, ZakatCalculation.STATUS_FINALIZED)


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

    def test_create_calculation_starts_as_draft(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        response = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'draft')
        # Le stock estimé est recalculé même sur un brouillon.
        self.assertEqual(Decimal(response.data['stock_value_estimated']), Decimal('80.00'))
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
                'current_step': 4,
                'cash_amount': '500.00',
                'debts_breakdown': [
                    {'category': 'supplier', 'label': 'Fournisseur', 'amount': '200.00', 'is_immediately_due': True},
                    {'category': 'loan', 'label': 'Emprunt 5 ans', 'amount': '5000.00', 'is_immediately_due': False},
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        # Seule la dette exigible immédiatement entre dans short_term_debts.
        self.assertEqual(Decimal(patch.data['short_term_debts']), Decimal('200.00'))

    def test_finalize_endpoint_computes_zakat(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        calc_id = create.data['id']
        finalize = self.client.post(reverse('zakat-calculation-finalize', kwargs={'pk': calc_id}))
        self.assertEqual(finalize.status_code, status.HTTP_200_OK)
        self.assertEqual(finalize.data['status'], 'finalized')
        self.assertEqual(Decimal(finalize.data['zakat_base']), Decimal('580.00'))
        self.assertEqual(Decimal(finalize.data['zakat_amount']), Decimal('14.50'))

    def test_finalize_endpoint_refuses_second_calc_same_year(self):
        # Premier calcul finalisé pour 2025.
        first = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        first_id = first.data['id']
        self.client.post(reverse('zakat-calculation-finalize', kwargs={'pk': first_id}))

        # Deuxième brouillon pour 2025 — la finalisation doit renvoyer 409.
        second = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-09-15',
        }, format='json')
        second_id = second.data['id']
        finalize = self.client.post(reverse('zakat-calculation-finalize', kwargs={'pk': second_id}))
        self.assertEqual(finalize.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(finalize.data['year'], 2025)
        self.assertEqual(finalize.data['existing_id'], first_id)

    def test_patch_draft_with_receivables_breakdown_sums_recoverable_only(self):
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        calc_id = create.data['id']
        patch = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc_id}),
            {
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
                'debts_breakdown': [
                    {'category': 'rent', 'label': 'Loyer mars', 'amount': '800.00', 'is_immediately_due': True},
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(patch.data['short_term_debts']), Decimal('800.00'))

    def test_finalized_calculation_is_immutable(self):
        calc = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01',
            status='finalized', currency='EUR',
        )
        response = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc.pk}),
            {'cash_amount': '999.00'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_draft_current_endpoint_returns_latest_draft(self):
        ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01',
            status='draft', currency='EUR', current_step=2,
        )
        response = self.client.get(reverse('zakat-draft-current'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['current_step'], 2)

    def test_draft_current_endpoint_returns_204_when_no_draft(self):
        response = self.client.get(reverse('zakat-draft-current'))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

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

    def test_pdf_endpoint_returns_pdf_for_finalized_calc(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        calc_id = create.data['id']
        self.client.post(reverse('zakat-calculation-finalize', kwargs={'pk': calc_id}))
        response = self.client.get(reverse('zakat-calculation-pdf', kwargs={'pk': calc_id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        # Le PDF doit commencer par la signature standard %PDF-
        self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_reopen_brings_finalized_back_to_draft(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        calc_id = create.data['id']
        self.client.post(reverse('zakat-calculation-finalize', kwargs={'pk': calc_id}))
        response = self.client.post(reverse('zakat-calculation-reopen', kwargs={'pk': calc_id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'draft')
        self.assertIsNone(response.data['finalized_at'])

    def test_reopen_refused_if_another_draft_exists(self):
        finalized = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-01-01',
            status='finalized', currency='EUR',
        )
        ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01',
            status='draft', currency='EUR', current_step=2,
        )
        response = self.client.post(reverse('zakat-calculation-reopen', kwargs={'pk': finalized.pk}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_calculation(self):
        calc = ZakatCalculation.objects.create(
            shop=self.shop, reference_date='2025-03-01',
            status='finalized', currency='EUR',
        )
        response = self.client.delete(
            reverse('zakat-calculation-detail', kwargs={'pk': calc.pk}),
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ZakatCalculation.objects.filter(pk=calc.pk).exists())

    def test_pdf_endpoint_refuses_draft(self):
        _make_product(self.shop, 'P', Decimal('10'), Decimal('8'), 10)
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
            'cash_amount': '500.00',
        }, format='json')
        response = self.client.get(reverse('zakat-calculation-pdf', kwargs={'pk': create.data['id']}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
