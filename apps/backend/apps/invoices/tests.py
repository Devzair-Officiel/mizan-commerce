from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.orders import services as order_services
from apps.products.models import Product, ProductVariant
from apps.shops.models import Shop, ShopMember
from apps.stock.models import StockMovement

from . import services
from .models import Invoice, InvoiceLine, InvoiceSequence


def _make_shop(email: str, *, with_variant: bool = True) -> tuple[User, Shop, ProductVariant | None, Customer]:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(
        name=f'Shop {email}',
        currency='EUR',
        country='FR',
        legal_address='10 rue de Paris\n75001 Paris',
        tax_id='FR123456789',
        legal_mentions='SIRET: 12345678900012',
        default_tax_rate=Decimal('20.00'),
        default_payment_terms_days=30,
    )
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    from apps.subscriptions.test_utils import attach_subscription
    attach_subscription(shop)  # Plan Pro requis pour les endpoints invoices.

    variant = None
    if with_variant:
        product = Product.objects.create(shop=shop, name=f'Produit {email}')
        variant = ProductVariant.objects.create(
            shop=shop, product=product, packaging_name='Unité',
            unit='piece', base_quantity=1, selling_price='10.00',
        )
        StockMovement.objects.create(
            shop=shop, variant=variant, movement_type='in',
            quantity=100, created_by=user,
        )
    customer = Customer.objects.create(
        shop=shop, name='Dupont', first_name='Jean',
        email='jean@example.com', phone='+33600000000',
        address_line='12 avenue de la République',
        postal_code='75011', city='Paris', country='FR',
    )
    return user, shop, variant, customer


def _make_order_with_items(shop: Shop, user: User, variant: ProductVariant,
                          customer: Customer | None = None,
                          *, qty: int = 2, discount: str = '0', shipping: str = '0') -> 'order_services.Order':
    order = order_services.create_order(
        shop, user, customer=customer,
        discount=Decimal(discount), shipping=Decimal(shipping),
    )
    order_services.add_item(order, variant, qty)
    order.refresh_from_db()
    return order


class InvoiceNumberingTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('num@example.com')

    def test_number_format(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        parts = invoice.number.split('-')
        self.assertEqual(parts[0], 'fact')
        self.assertEqual(len(parts[1]), 6)  # DDMMYY
        self.assertEqual(parts[2], '0001')

    def test_numbers_are_sequential_per_shop(self):
        order1 = _make_order_with_items(self.shop, self.user, self.variant)
        order2 = _make_order_with_items(self.shop, self.user, self.variant)
        order3 = _make_order_with_items(self.shop, self.user, self.variant)
        i1 = services.issue_invoice_from_order(shop=self.shop, order=order1)
        i2 = services.issue_invoice_from_order(shop=self.shop, order=order2)
        i3 = services.issue_invoice_from_order(shop=self.shop, order=order3)
        self.assertEqual(i1.number.split('-')[2], '0001')
        self.assertEqual(i2.number.split('-')[2], '0002')
        self.assertEqual(i3.number.split('-')[2], '0003')

    def test_sequence_is_isolated_per_shop(self):
        user_b, shop_b, variant_b, _ = _make_shop('numb@example.com')
        order_a = _make_order_with_items(self.shop, self.user, self.variant)
        order_b = _make_order_with_items(shop_b, user_b, variant_b)
        i_a = services.issue_invoice_from_order(shop=self.shop, order=order_a)
        i_b = services.issue_invoice_from_order(shop=shop_b, order=order_b)
        self.assertEqual(i_a.number.split('-')[2], '0001')
        self.assertEqual(i_b.number.split('-')[2], '0001')

    def test_sequence_continues_after_cancellation(self):
        order1 = _make_order_with_items(self.shop, self.user, self.variant)
        order2 = _make_order_with_items(self.shop, self.user, self.variant)
        i1 = services.issue_invoice_from_order(shop=self.shop, order=order1)
        services.cancel_invoice(i1)
        i2 = services.issue_invoice_from_order(shop=self.shop, order=order2)
        # Le numéro reste attribué, le suivant continue.
        self.assertEqual(i2.number.split('-')[2], '0002')


class InvoiceTotalsTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('totals@example.com')

    def test_totals_simple(self):
        # 2 × 10€ HT, TVA 20% → 20€ HT, 4€ TVA, 24€ TTC.
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=2)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.subtotal_ht, Decimal('20.00'))
        self.assertEqual(invoice.tax_amount, Decimal('4.00'))
        self.assertEqual(invoice.total_ttc, Decimal('24.00'))

    def test_totals_with_discount_and_shipping(self):
        # 4 × 10 = 40 HT, -5 remise, +3 port → base 38, TVA 20% = 7.60, TTC = 45.60.
        order = _make_order_with_items(
            self.shop, self.user, self.variant, qty=4,
            discount='5', shipping='3',
        )
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.subtotal_ht, Decimal('40.00'))
        self.assertEqual(invoice.discount_amount, Decimal('5.00'))
        self.assertEqual(invoice.shipping_amount, Decimal('3.00'))
        self.assertEqual(invoice.tax_amount, Decimal('7.60'))
        self.assertEqual(invoice.total_ttc, Decimal('45.60'))

    def test_totals_with_zero_tax(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=3)
        invoice = services.issue_invoice_from_order(
            shop=self.shop, order=order, tax_rate=Decimal('0'),
        )
        self.assertEqual(invoice.tax_amount, Decimal('0.00'))
        self.assertEqual(invoice.total_ttc, Decimal('30.00'))

    def test_tax_rate_override(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        invoice = services.issue_invoice_from_order(
            shop=self.shop, order=order, tax_rate=Decimal('5.50'),
        )
        self.assertEqual(invoice.tax_rate, Decimal('5.50'))
        # 10 × 5.50% = 0.55 → total 10.55
        self.assertEqual(invoice.tax_amount, Decimal('0.55'))
        self.assertEqual(invoice.total_ttc, Decimal('10.55'))


class InvoiceSnapshotTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('snap@example.com')

    def test_seller_snapshot_is_immutable_after_shop_change(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, customer=self.customer)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        original_name = invoice.seller_name
        original_address = invoice.seller_address
        original_tax_id = invoice.seller_tax_id

        self.shop.name = 'Nouveau Nom'
        self.shop.legal_address = 'Nouvelle adresse'
        self.shop.tax_id = 'NEW_TAX'
        self.shop.save()

        invoice.refresh_from_db()
        self.assertEqual(invoice.seller_name, original_name)
        self.assertEqual(invoice.seller_address, original_address)
        self.assertEqual(invoice.seller_tax_id, original_tax_id)

    def test_buyer_snapshot_from_customer(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, customer=self.customer)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.buyer_name, 'Jean Dupont')
        self.assertIn('12 avenue', invoice.buyer_address)
        self.assertIn('75011', invoice.buyer_address)
        self.assertEqual(invoice.buyer_city, 'Paris')
        self.assertEqual(invoice.buyer_email, 'jean@example.com')

    def test_buyer_fields_empty_without_customer(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, customer=None)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.buyer_name, '')
        self.assertIsNone(invoice.customer)

    def test_buyer_snapshot_immutable_after_customer_rename(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, customer=self.customer)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        original = invoice.buyer_name

        self.customer.name = 'Martin'
        self.customer.first_name = 'Paul'
        self.customer.save()

        invoice.refresh_from_db()
        self.assertEqual(invoice.buyer_name, original)


class InvoiceIssueGuardsTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('guard@example.com')

    def test_empty_order_raises(self):
        order = order_services.create_order(self.shop, self.user)
        with self.assertRaises(services.EmptyOrderError):
            services.issue_invoice_from_order(shop=self.shop, order=order)

    def test_duplicate_invoice_raises(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        first = services.issue_invoice_from_order(shop=self.shop, order=order)
        with self.assertRaises(services.InvoiceAlreadyExistsError) as ctx:
            services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(ctx.exception.invoice_id, first.pk)

    def test_lines_match_order_items(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=3)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        lines = list(invoice.lines.all())
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].quantity, Decimal('3'))
        self.assertEqual(lines[0].unit_price_ht, Decimal('10.00'))
        self.assertEqual(lines[0].line_subtotal_ht, Decimal('30.00'))


class InvoiceStatusInitTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('init@example.com')

    def test_paid_order_yields_paid_invoice(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        order_services.update_payment(order, Decimal('10.00'), user=self.user)
        order.refresh_from_db()
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.status, Invoice.STATUS_PAID)
        self.assertIsNotNone(invoice.paid_at)

    def test_cancelled_order_yields_cancelled_invoice(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        order_services.transition_status(order, 'cancelled', self.user)
        order.refresh_from_db()
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.status, Invoice.STATUS_CANCELLED)
        self.assertIsNotNone(invoice.cancelled_at)


class InvoiceSyncFromOrderTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('sync@example.com')

    def test_sync_marks_paid_when_order_paid(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        self.assertEqual(invoice.status, Invoice.STATUS_ISSUED)

        order_services.update_payment(order, Decimal('10.00'), user=self.user)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_PAID)
        self.assertEqual(invoice.amount_paid, Decimal('10.00'))

    def test_sync_marks_cancelled_when_order_cancelled(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        order_services.transition_status(order, 'cancelled', self.user)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_CANCELLED)

    def test_cancelled_invoice_stays_cancelled_after_order_unpaid(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        services.cancel_invoice(invoice)
        # Une commande qui change après n'altère plus la facture annulée.
        order_services.update_payment(order, Decimal('10.00'), user=self.user)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_CANCELLED)

    def test_partial_payment_keeps_issued(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=2)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        order_services.update_payment(order, Decimal('5.00'), user=self.user)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_ISSUED)
        self.assertEqual(invoice.amount_paid, Decimal('5.00'))

    def test_reverts_to_issued_if_payment_drops(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, qty=1)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        order_services.update_payment(order, Decimal('10.00'), user=self.user)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_PAID)

        order_services.update_payment(order, Decimal('5.00'), user=self.user)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_ISSUED)
        self.assertIsNone(invoice.paid_at)


class InvoiceStatusActionsTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.variant, self.customer = _make_shop('act@example.com')
        self.order = _make_order_with_items(self.shop, self.user, self.variant, qty=2)
        self.invoice = services.issue_invoice_from_order(shop=self.shop, order=self.order)

    def test_mark_paid_is_idempotent(self):
        services.mark_paid(self.invoice)
        first_paid_at = self.invoice.paid_at
        services.mark_paid(self.invoice)  # Second call
        self.assertEqual(self.invoice.paid_at, first_paid_at)
        self.assertEqual(self.invoice.status, Invoice.STATUS_PAID)

    def test_mark_paid_sets_amount_paid_to_total(self):
        services.mark_paid(self.invoice)
        self.assertEqual(self.invoice.amount_paid, self.invoice.total_ttc)

    def test_cancel_is_idempotent(self):
        services.cancel_invoice(self.invoice)
        first_cancelled_at = self.invoice.cancelled_at
        services.cancel_invoice(self.invoice)
        self.assertEqual(self.invoice.cancelled_at, first_cancelled_at)


class InvoiceAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.variant, self.customer = _make_shop('api@example.com')
        self.client.force_authenticate(user=self.user)

    def test_create_invoice_from_order(self):
        order = _make_order_with_items(self.shop, self.user, self.variant, customer=self.customer, qty=2)
        response = self.client.post(
            reverse('invoice-list'),
            {'order_id': str(order.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'issued')
        self.assertTrue(response.data['number'].startswith('fact-'))
        self.assertEqual(len(response.data['lines']), 1)

    def test_create_invoice_empty_order_returns_400(self):
        order = order_services.create_order(self.shop, self.user)
        response = self.client.post(
            reverse('invoice-list'),
            {'order_id': str(order.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_invoice_unknown_order_returns_404(self):
        response = self.client.post(
            reverse('invoice-list'),
            {'order_id': '00000000-0000-0000-0000-000000000000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_invoice_duplicate_returns_409(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        self.client.post(reverse('invoice-list'), {'order_id': str(order.pk)}, format='json')
        response = self.client.post(
            reverse('invoice-list'),
            {'order_id': str(order.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('existing_id', response.data)

    def test_list_invoices(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        services.issue_invoice_from_order(shop=self.shop, order=order)
        response = self.client.get(reverse('invoice-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)

    def test_list_filter_by_status(self):
        order1 = _make_order_with_items(self.shop, self.user, self.variant)
        order2 = _make_order_with_items(self.shop, self.user, self.variant)
        i1 = services.issue_invoice_from_order(shop=self.shop, order=order1)
        services.issue_invoice_from_order(shop=self.shop, order=order2)
        services.cancel_invoice(i1)
        response = self.client.get(reverse('invoice-list') + '?status=cancelled')
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['status'], 'cancelled')

    def test_retrieve_invoice(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        response = self.client.get(reverse('invoice-detail', kwargs={'pk': invoice.pk}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['number'], invoice.number)

    def test_patch_status_to_paid(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        response = self.client.patch(
            reverse('invoice-status', kwargs={'pk': invoice.pk}),
            {'status': 'paid'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'paid')

    def test_patch_status_cancelled_blocks_further_changes(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        services.cancel_invoice(invoice)
        response = self.client.patch(
            reverse('invoice-status', kwargs={'pk': invoice.pk}),
            {'status': 'paid'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_status_rejects_invalid_value(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        response = self.client.patch(
            reverse('invoice-status', kwargs={'pk': invoice.pk}),
            {'status': 'issued'},  # interdit via API
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_delete_invoice(self):
        order = _make_order_with_items(self.shop, self.user, self.variant)
        invoice = services.issue_invoice_from_order(shop=self.shop, order=order)
        response = self.client.delete(reverse('invoice-detail', kwargs={'pk': invoice.pk}))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class InvoiceMultiTenantTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a, self.variant_a, _ = _make_shop('a@example.com')
        self.user_b, self.shop_b, self.variant_b, _ = _make_shop('b@example.com')
        order_b = _make_order_with_items(self.shop_b, self.user_b, self.variant_b)
        self.invoice_b = services.issue_invoice_from_order(shop=self.shop_b, order=order_b)

    def test_user_a_cannot_see_invoice_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('invoice-detail', kwargs={'pk': self.invoice_b.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_patch_invoice_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            reverse('invoice-status', kwargs={'pk': self.invoice_b.pk}),
            {'status': 'paid'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_issue_invoice_on_order_b(self):
        order_b = _make_order_with_items(self.shop_b, self.user_b, self.variant_b)
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            reverse('invoice-list'),
            {'order_id': str(order_b.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_list_excludes_other_shops(self):
        self.client.force_authenticate(user=self.user_a)
        order_a = _make_order_with_items(self.shop_a, self.user_a, self.variant_a)
        services.issue_invoice_from_order(shop=self.shop_a, order=order_a)
        response = self.client.get(reverse('invoice-list'))
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
