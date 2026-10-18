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

    def test_patch_draft_accepts_rent_debt_category(self):
        create = self.client.post(reverse('zakat-calculation-list'), {
            'reference_date': '2025-03-01',
        }, format='json')
        calc_id = create.data['id']
        patch = self.client.patch(
            reverse('zakat-calculation-detail', kwargs={'pk': calc_id}),
            {
                'version': create.data['version'],
                'debt_items': [
                    {'category': 'rent', 'label': 'Loyer mars', 'amount': '800.00', 'amount_within_12_months': '800.00'},  # noqa: E501
                ],
            }, format='json',
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        debt = patch.data['debt_items'][0]
        self.assertEqual(debt['category'], 'rent')
        self.assertEqual(Decimal(debt['amount']), Decimal('800.00'))

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
        calc = _calc(self.shop, self.user, '2025-03-01')
        response = self.client.delete(
            reverse('zakat-calculation-detail', kwargs={'pk': calc.pk}),
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ZakatCalculation.objects.filter(pk=calc.pk).exists())

