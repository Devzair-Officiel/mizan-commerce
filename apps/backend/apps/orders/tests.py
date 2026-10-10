from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from apps.customers.models import Customer
from apps.stock.models import StockMovement
from . import services
from .models import Order


def setup(email, fulfillment_mode=None):
    from apps.subscriptions.test_utils import attach_subscription
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}', fulfillment_mode=fulfillment_mode)
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    attach_subscription(shop)  # Plan Pro requis pour les endpoints orders.
    product = Product.objects.create(shop=shop, name='Article test')
    variant = ProductVariant.objects.create(
        shop=shop, product=product, packaging_name='Par défaut',
        unit='piece', base_quantity=1, selling_price='20.00',
    )
    StockMovement.objects.create(shop=shop, variant=variant, movement_type='in', quantity=50, created_by=user)  # noqa: E501
    customer = Customer.objects.create(shop=shop, name='Client test')
    return user, shop, product, variant, customer


class OrderServiceTest(TestCase):

    def setUp(self):
        self.user, self.shop, self.product, self.variant, self.customer = setup('service@example.com')  # noqa: E501

    def test_create_order_generates_number(self):
        from django.utils import timezone
        order = services.create_order(self.shop, self.user)
        self.assertTrue(order.order_number.startswith(str(timezone.now().year)))

    def test_order_numbers_are_sequential(self):
        o1 = services.create_order(self.shop, self.user)
        o2 = services.create_order(self.shop, self.user)
        seq1 = int(o1.order_number.split('-')[1])
        seq2 = int(o2.order_number.split('-')[1])
        self.assertEqual(seq2, seq1 + 1)

    def test_add_item_calculates_total(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 3)
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('60.00'))
        self.assertEqual(order.total_amount, Decimal('60.00'))

    def test_total_with_discount_and_shipping(self):
        order = services.create_order(self.shop, self.user, discount=Decimal('5'), shipping=Decimal('3'))  # noqa: E501
        services.add_item(order, self.variant, 2)
        order.refresh_from_db()
        # 40 - 5 + 3 = 38
        self.assertEqual(order.total_amount, Decimal('38.00'))

    def test_reserve_stock_on_to_prepare(self):
        """Réserver le stock explicitement après création."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 5)
        services.reserve_stock(order, self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 45)  # 50 - 5
        self.assertTrue(order.stock_reserved)

    def test_cancel_releases_stock(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 5)
        services.reserve_stock(order, self.user)
        services.transition_status(order, 'cancelled', self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 50)  # restauré
        self.assertFalse(order.stock_reserved)

    def test_cancel_then_reactivate_re_reserves_stock(self):
        """cancelled → to_prepare re-réserve le stock."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 3)
        services.reserve_stock(order, self.user)
        services.transition_status(order, 'cancelled', self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 50)
        services.transition_status(order, 'to_prepare', self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 47)  # 50 - 3 re-réservés
        self.assertTrue(order.stock_reserved)
        self.assertIsNone(order.cancelled_at)

    def test_non_delivery_path_to_prepare_to_shipped(self):
        """Boutique sans livraison : to_prepare → shipped directement."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        services.transition_status(order, 'shipped', self.user)
        order.refresh_from_db()
        self.assertEqual(order.status, 'shipped')

    def test_delivery_path_to_prepare_prepared_shipped(self):
        """Boutique livraison : to_prepare → prepared → shipped."""
        _, delivery_shop, _, delivery_variant, _ = setup('delivery@example.com', fulfillment_mode='delivery')  # noqa: E501
        user = User.objects.get(email='delivery@example.com')
        order = services.create_order(delivery_shop, user)
        services.add_item(order, delivery_variant, 1)
        services.reserve_stock(order, user)
        services.transition_status(order, 'prepared', user)
        self.assertEqual(order.status, 'prepared')
        services.transition_status(order, 'shipped', user)
        order.refresh_from_db()
        self.assertEqual(order.status, 'shipped')

    def test_delivery_shop_cannot_skip_prepared(self):
        """to_prepare → shipped est interdit pour une boutique livraison."""
        _, delivery_shop, _, _, _ = setup('delivery2@example.com', fulfillment_mode='delivery')  # noqa: E501
        user = User.objects.get(email='delivery2@example.com')
        order = services.create_order(delivery_shop, user)
        with self.assertRaises(ValueError):
            services.transition_status(order, 'shipped', user)

    def test_non_delivery_cannot_go_to_prepared(self):
        """to_prepare → prepared est interdit pour une boutique non-livraison."""
        order = services.create_order(self.shop, self.user)
        with self.assertRaises(ValueError):
            services.transition_status(order, 'prepared', self.user)

    def test_shipped_order_cannot_be_cancelled(self):
        """shipped ne peut pas être annulé (ni en livraison, ni sans)."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        services.transition_status(order, 'shipped', self.user)
        with self.assertRaises(ValueError):
            services.transition_status(order, 'cancelled', self.user)

    def test_add_item_delta_stock_when_reserved(self):
        """Ajouter un article réservé déclenche un mouvement delta."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 2)
        services.reserve_stock(order, self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 48)  # 50 - 2
        services.add_item(order, self.variant, 3, user=self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 45)  # 48 - 3

    def test_update_item_quantity_delta_stock(self):
        """Modifier la quantité d'un article réservé crée un mouvement delta."""
        order = services.create_order(self.shop, self.user)
        item = services.add_item(order, self.variant, 2)
        services.reserve_stock(order, self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 48)
        services.update_item_quantity(order, item, 5, user=self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 45)  # 48 - (5-2)=3

    def test_remove_item_releases_delta_stock(self):
        """Retirer un article d'une commande réservée libère le stock."""
        order = services.create_order(self.shop, self.user)
        item = services.add_item(order, self.variant, 4)
        services.reserve_stock(order, self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 46)
        services.remove_item(order, item, user=self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 50)

    def test_payment_status_updates(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 2)  # total = 40
        order.refresh_from_db()
        services.update_payment(order, Decimal('20'))
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'partial')
        services.update_payment(order, Decimal('40'))
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')

    def test_cannot_add_item_to_shipped(self):
        """Impossible d'ajouter un article à une commande expédiée."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        services.transition_status(order, 'shipped', self.user)
        with self.assertRaises(ValueError):
            services.add_item(order, self.variant, 1)

    def test_stale_item_atomicity_uses_db_quantity(self):
        """select_for_update force la relecture DB — objet périmé → delta correct."""
        order = services.create_order(self.shop, self.user)
        item = services.add_item(order, self.variant, 2)
        services.reserve_stock(order, self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 48)  # 50-2

        # Première mise à jour légtime : qty 2 → 5
        services.update_item_quantity(order, item, 5, user=self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 45)  # 50-5

        # Objet périmé : qty en mémoire = 2, DB = 5.
        # Le service re-lit depuis la DB et calcule delta = 3-5 = -2 (libération).
        from apps.orders.models import OrderItem
        stale = OrderItem.objects.get(pk=item.pk)
        stale.quantity = 2  # simuler la péremption
        services.update_item_quantity(order, stale, 3, user=self.user)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 47)  # 45+2 libérés
        item.refresh_from_db()
        self.assertEqual(item.quantity, 3)

    def test_cannot_create_draft_order(self) -> None:
        from django.db import IntegrityError, transaction
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                from .models import Order
                Order.objects.create(
                    shop=self.shop,
                    status='draft',
                    order_number='TEST-DRAFT-999',
                )


class AdvanceOrderToTest(TestCase):
    """Tests pour advance_order_to — enchaînement automatique de transitions."""

    def setUp(self):
        self.user, self.shop, _, self.variant, self.customer = setup(  # noqa: E501
            'advance@example.com'
        )

    def _order(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        return order

    def test_on_site_advance_to_shipped(self):
        """on_site : advance_order_to('shipped') enchaîne to_prepare → shipped."""
        order = self._order()
        result = services.advance_order_to(order, 'shipped', self.user)
        result.refresh_from_db()
        self.assertEqual(result.status, 'shipped')

    def test_delivery_advance_to_shipped(self):
        """Boutique delivery : advance_order_to('shipped') enchaîne to_prepare → prepared → shipped."""  # noqa: E501
        _, delivery_shop, _, delivery_variant, _ = setup('advance_delivery@example.com', fulfillment_mode='delivery')  # noqa: E501
        user = User.objects.get(email='advance_delivery@example.com')
        order = services.create_order(delivery_shop, user)
        services.add_item(order, delivery_variant, 1)
        result = services.advance_order_to(order, 'shipped', user)
        result.refresh_from_db()
        self.assertEqual(result.status, 'shipped')

    def test_already_at_target_is_noop(self):
        """advance_order_to ne fait rien si l'order est déjà au statut cible."""
        order = self._order()
        self.assertEqual(order.status, 'to_prepare')
        result = services.advance_order_to(order, 'to_prepare', self.user)
        self.assertEqual(result.status, 'to_prepare')

    def test_impossible_target_raises(self):
        """Cible inaccessible (ex: 'prepared' pour on_site) lève ValueError."""
        order = self._order()
        with self.assertRaises(ValueError):
            services.advance_order_to(order, 'prepared', self.user)


class OrderAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.product, self.variant, self.customer = setup('api@example.com')  # noqa: E501
        self.client.force_authenticate(user=self.user)

    def test_create_order_via_api(self):
        response = self.client.post(reverse('order-list'), {
            'customer': str(self.customer.pk),
            'items': [{'variant': str(self.variant.pk), 'quantity': 2}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['subtotal'], '40.00')
        self.assertEqual(response.data['status'], 'to_prepare')

    def test_create_order_shipped_via_api(self):
        """Création directe en shipped pour une boutique non-livraison."""
        response = self.client.post(reverse('order-list'), {
            'items': [{'variant': str(self.variant.pk), 'quantity': 1}],
            'status': 'shipped',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'shipped')

    def test_create_order_without_customer(self):
        response = self.client.post(reverse('order-list'), {
            'items': [{'variant': str(self.variant.pk), 'quantity': 1}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['customer'])

    def test_list_filter_by_status(self):
        services.create_order(self.shop, self.user)
        response = self.client.get(reverse('order-list') + '?status=to_prepare')
        self.assertEqual(response.data['count'], 1)

    def test_status_transition_via_api(self):
        """Transition to_prepare → shipped via API (boutique non-livraison)."""
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        response = self.client.post(reverse('order-status', kwargs={'pk': order.pk}), {'status': 'shipped'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'shipped')

    def test_cannot_delete_order(self):
        order = services.create_order(self.shop, self.user)
        response = self.client.delete(reverse('order-detail', kwargs={'pk': order.pk}))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class OrderMultiTenantTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a, self.product_a, self.variant_a, _ = setup('a@example.com')  # noqa: E501
        self.user_b, self.shop_b, self.product_b, self.variant_b, _ = setup('b@example.com')  # noqa: E501
        self.order_b = services.create_order(self.shop_b, self.user_b)

    def test_user_a_cannot_see_order_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('order-detail', kwargs={'pk': self.order_b.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_transition_order_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            reverse('order-status', kwargs={'pk': self.order_b.pk}),
            {'status': 'cancelled'},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class OrderListFilterAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.product, self.variant, self.customer = setup(  # noqa: E501
            'filter@example.com',
        )
        self.client.force_authenticate(user=self.user)

        self.user_b, self.shop_b, self.product_b, self.variant_b, _ = setup(  # noqa: E501
            'filter_b@example.com',
        )

    def _make_order(self, shop=None, user=None, status_val='to_prepare', payment_status_val='unpaid'):  # noqa: E501
        s = shop or self.shop
        u = user or self.user
        v = self.variant if s == self.shop else self.variant_b
        order = services.create_order(s, u)
        services.add_item(order, v, 1)
        services.reserve_stock(order, u)
        if status_val == 'shipped':
            services.transition_status(order, 'shipped', u)
        elif status_val == 'cancelled':
            services.transition_status(order, 'cancelled', u)
        if payment_status_val == 'paid':
            order.refresh_from_db()
            services.update_payment(order, order.total_amount, user=u)
        elif payment_status_val == 'partial':
            order.refresh_from_db()
            services.update_payment(order, order.total_amount / 2, user=u)
        return order

    def test_due_excludes_cancelled(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        services.transition_status(order, 'cancelled', self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 0)

    def test_due_excludes_paid(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        order.refresh_from_db()
        services.update_payment(order, order.total_amount, user=self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 0)

    def test_due_includes_correct(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 1)

    def test_due_other_shop_excluded(self):
        # commande due de l'autre boutique
        order_b = services.create_order(self.shop_b, self.user_b)
        services.add_item(order_b, self.variant_b, 1)
        services.reserve_stock(order_b, self.user_b)
        # commande due de ma boutique
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        services.reserve_stock(order, self.user)
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(order.id))

    def test_search_by_customer_name(self):
        customer = Customer.objects.create(shop=self.shop, name='Karima Benali')
        order = services.create_order(self.shop, self.user, customer=customer)
        services.add_item(order, self.variant, 1)
        response = self.client.get(reverse('order-list') + '?search=Karima')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(order.id))

    def test_search_by_order_number(self):
        order = services.create_order(self.shop, self.user)
        services.add_item(order, self.variant, 1)
        number = order.order_number
        response = self.client.get(reverse('order-list') + f'?search={number}')
        self.assertGreaterEqual(response.data['count'], 1)
        ids = [r['id'] for r in response.data['results']]
        self.assertIn(str(order.id), ids)

    def test_items_preview_no_n_plus_one(self):
        # Crée 3 commandes avec 1 article chacune
        for _ in range(3):
            order = services.create_order(self.shop, self.user)
            services.add_item(order, self.variant, 1)

        # shop_member×2 + subscription + plan + get_shop + count + list + items prefetch
        with self.assertNumQueries(8):
            response = self.client.get(reverse('order-list'))
        self.assertEqual(response.status_code, 200)
        # Les items_preview sont présents
        for item in response.data['results']:
            self.assertIn('items_preview', item)


def make_order(shop, user, *, status_val='to_prepare', payment_val='unpaid',
               total='0', paid='0', customer=None, created_at=None):
    """Commande aux valeurs imposées (sans passer par le stock) pour tri et agrégats."""
    order = services.create_order(shop, user, customer=customer)
    fields = {
        'status': status_val, 'payment_status': payment_val,
        'total_amount': Decimal(total), 'amount_paid': Decimal(paid),
    }
    if created_at is not None:
        fields['created_at'] = created_at
    Order.objects.filter(pk=order.pk).update(**fields)
    return order


class OrderOrderingAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, *_ = setup('ordering@example.com')
        self.client.force_authenticate(user=self.user)
        base = datetime(2026, 10, 1, 10, 0, tzinfo=dt_timezone.utc)
        rows = [
            ('shipped', 'partial', '30.00', 'Bachir', 2),
            ('to_prepare', 'paid', '10.00', 'Amina', 0),
            ('cancelled', 'unpaid', '40.00', 'Dounia', 3),
            ('prepared', 'unpaid', '20.00', 'Chafik', 1),
        ]
        self.orders = {}
        for status_val, payment_val, total, name, day in rows:
            customer = Customer.objects.create(shop=self.shop, name=name)
            self.orders[name] = make_order(
                self.shop, self.user, status_val=status_val, payment_val=payment_val,
                total=total, customer=customer, created_at=base + timedelta(days=day),
            )

    def _names(self, ordering=None):
        url = reverse('order-list')
        if ordering:
            url += f'?ordering={ordering}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [r.get('customer_name') for r in response.data['results']]

    def assert_both_ways(self, field, ascending):
        self.assertEqual(self._names(field), ascending)
        self.assertEqual(self._names(f'-{field}'), ascending[::-1])

    def test_default_is_most_recent_first(self):
        self.assertEqual(self._names(), ['Dounia', 'Bachir', 'Chafik', 'Amina'])

    def test_order_number(self):
        # Numéros séquentiels dans l'ordre de création des lignes ci-dessus.
        self.assert_both_ways('order_number', ['Bachir', 'Amina', 'Dounia', 'Chafik'])

    def test_customer_name(self):
        self.assert_both_ways('customer__name', ['Amina', 'Bachir', 'Chafik', 'Dounia'])

    def test_customer_name_puts_orders_without_client_last(self):
        recent = datetime(2026, 10, 9, tzinfo=dt_timezone.utc)
        make_order(self.shop, self.user, total='5.00', created_at=recent)
        self.assertEqual(self._names('customer__name')[-1], None)
        self.assertEqual(self._names('-customer__name')[-1], None)

    def test_created_at(self):
        self.assert_both_ways('created_at', ['Amina', 'Chafik', 'Bachir', 'Dounia'])

    def test_total_amount(self):
        self.assert_both_ways('total_amount', ['Amina', 'Chafik', 'Bachir', 'Dounia'])

    def test_status_follows_journey(self):
        # à traiter < prête < remise < annulée (pas l'ordre alphabétique).
        self.assert_both_ways('status', ['Amina', 'Chafik', 'Bachir', 'Dounia'])

    def test_payment_status_follows_collection(self):
        # non payée < partiel < payée ; ex æquo départagés par date décroissante.
        self.assertEqual(self._names('payment_status'), ['Dounia', 'Chafik', 'Bachir', 'Amina'])  # noqa: E501
        self.assertEqual(self._names('-payment_status'), ['Amina', 'Bachir', 'Dounia', 'Chafik'])  # noqa: E501

    def test_unknown_field_falls_back_to_default(self):
        self.assertEqual(self._names('amount_paid'), ['Dounia', 'Bachir', 'Chafik', 'Amina'])  # noqa: E501


class OrderPeriodFilterAPITest(TestCase):
    """`period=month` suit le fuseau de la boutique, pas l'UTC du serveur."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, *_ = setup('period@example.com')
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.shop.timezone, 'Europe/Paris')
        # 31 oct. 23:15 UTC = 1er nov. 00:15 à Paris → novembre.
        self.november = make_order(
            self.shop, self.user, created_at=datetime(2026, 10, 31, 23, 15, tzinfo=dt_timezone.utc),  # noqa: E501
        )
        # 31 oct. 22:30 UTC = 31 oct. 23:30 à Paris → octobre.
        self.october = make_order(
            self.shop, self.user, created_at=datetime(2026, 10, 31, 22, 30, tzinfo=dt_timezone.utc),  # noqa: E501
        )
        _, shop_b, *_ = setup('period_b@example.com')
        user_b = User.objects.get(email='period_b@example.com')
        make_order(shop_b, user_b, created_at=datetime(2026, 11, 2, tzinfo=dt_timezone.utc))  # noqa: E501

    def _ids(self, now):
        with patch('apps.orders.services.timezone.now', return_value=now):
            response = self.client.get(reverse('order-list') + '?period=month')
        return [r['id'] for r in response.data['results']]

    def test_month_boundary_in_shop_timezone(self):
        # 1er nov. 00:30 à Paris, encore le 31 oct. en UTC.
        now = datetime(2026, 10, 31, 23, 30, tzinfo=dt_timezone.utc)
        self.assertEqual(self._ids(now), [str(self.november.id)])

    def test_previous_month(self):
        now = datetime(2026, 10, 15, 12, 0, tzinfo=dt_timezone.utc)
        self.assertEqual(self._ids(now), [str(self.october.id)])

    def test_bounds_roll_over_december(self):
        now = datetime(2026, 12, 31, 23, 30, tzinfo=dt_timezone.utc)  # 1er janv., Paris
        start, end = services.current_month_bounds(self.shop, now)
        self.assertEqual((start.year, start.month, end.year, end.month), (2027, 1, 2027, 2))  # noqa: E501
        start, end = services.current_month_bounds(self.shop, now - timedelta(hours=1))
        self.assertEqual((start.month, end.year, end.month), (12, 2027, 1))


class OrderSummaryAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, *_ = setup('summary@example.com')
        self.client.force_authenticate(user=self.user)
        self.now = datetime(2026, 10, 20, 12, 0, tzinfo=dt_timezone.utc)
        this_month = datetime(2026, 10, 5, 9, 0, tzinfo=dt_timezone.utc)
        last_month = datetime(2026, 9, 28, 9, 0, tzinfo=dt_timezone.utc)
        make_order(self.shop, self.user, total='20.00', created_at=last_month)
        make_order(self.shop, self.user, total='15.00', created_at=this_month)
        make_order(self.shop, self.user, status_val='shipped', payment_val='partial',
                   total='30.00', paid='10.00', created_at=this_month)
        make_order(self.shop, self.user, status_val='shipped', payment_val='paid',
                   total='50.00', paid='50.00', created_at=this_month)
        make_order(self.shop, self.user, status_val='cancelled', total='99.00',
                   created_at=this_month)
        # Autre boutique : ne doit rien changer aux chiffres.
        _, shop_b, *_ = setup('summary_b@example.com')
        user_b = User.objects.get(email='summary_b@example.com')
        make_order(shop_b, user_b, total='500.00', created_at=datetime(2026, 1, 1, tzinfo=dt_timezone.utc))  # noqa: E501
        make_order(shop_b, user_b, status_val='shipped', total='500.00', created_at=this_month)  # noqa: E501

    def _get(self):
        with patch('apps.orders.services.timezone.now', return_value=self.now):
            response = self.client.get(reverse('order-summary'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_to_prepare(self):
        data = self._get()['to_prepare']
        self.assertEqual(data['count'], 2)
        self.assertEqual(data['oldest_created_at'], '2026-09-28T09:00:00+00:00')

    def test_due_matches_due_filter(self):
        data = self._get()['due']
        # 20 + 15 (non payées) + 20 restant sur la partielle ; l'annulée est exclue.
        self.assertEqual(data, {'count': 3, 'amount': '55.00'})
        response = self.client.get(reverse('order-list') + '?due=true')
        self.assertEqual(response.data['count'], data['count'])

    def test_month_excludes_cancelled_and_previous_months(self):
        data = self._get()['month']
        self.assertEqual(data, {'revenue': '95.00', 'shipped_count': 2})

    def test_empty_shop(self):
        user, _, *_ = setup('summary_empty@example.com')
        self.client.force_authenticate(user=user)
        self.assertEqual(self._get(), {
            'to_prepare': {'count': 0, 'oldest_created_at': None},
            'due': {'count': 0, 'amount': '0'},
            'month': {'revenue': '0', 'shipped_count': 0},
        })

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse('order-summary'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


PAYMENT_KEYS = ('due', 'payment_status')


class OrderFacetsAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, *_ = setup('facets@example.com')
        self.client.force_authenticate(user=self.user)
        amina = Customer.objects.create(shop=self.shop, name='Amina')
        bachir = Customer.objects.create(shop=self.shop, name='Bachir')
        rows = [
            ('to_prepare', 'unpaid', amina),
            ('to_prepare', 'paid', bachir),
            ('prepared', 'partial', amina),
            ('shipped', 'paid', amina),
            ('shipped', 'unpaid', bachir),
            ('cancelled', 'unpaid', amina),
        ]
        for status_val, payment_val, customer in rows:
            make_order(self.shop, self.user, status_val=status_val,
                       payment_val=payment_val, total='10.00', customer=customer)
        # Autre boutique : ne doit apparaître dans aucun nombre.
        user_b, shop_b, *_ = setup('facets_b@example.com')
        for _ in range(3):
            make_order(shop_b, user_b, status_val='shipped', payment_val='paid')

    def _facets(self, query=''):
        response = self.client.get(reverse('order-facets') + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _list_count(self, params):
        return self.client.get(reverse('order-list'), params).data['count']

    def test_counts_without_filter(self):
        self.assertEqual(self._facets(), {
            'status': {
                'all': 6, 'to_prepare': 2, 'prepared': 1, 'shipped': 2, 'cancelled': 1,
            },
            'payment': {'all': 6, 'due': 3, 'paid': 2},
        })

    def test_each_menu_ignores_its_own_filter(self):
        data = self._facets('?status=shipped&due=true')
        # Statut : filtré par « à encaisser » seulement (l'annulée en sort).
        self.assertEqual(data['status'], {
            'all': 3, 'to_prepare': 1, 'prepared': 1, 'shipped': 1, 'cancelled': 0,
        })
        # Paiement : filtré par « remises » seulement.
        self.assertEqual(data['payment'], {'all': 2, 'due': 1, 'paid': 1})

    def test_counts_match_list(self):
        payment_params = {'all': {}, 'due': {'due': 'true'}, 'paid': {'payment_status': 'paid'}}  # noqa: E501
        combos = [{}, {'search': 'Amina'}, {'status': 'to_prepare'},
                  {'due': 'true', 'search': 'bach'}, {'period': 'month'}]
        for base in combos:
            data = self.client.get(reverse('order-facets'), base).data
            others = {k: v for k, v in base.items() if k != 'status'}
            for value, count in data['status'].items():
                params = others if value == 'all' else {**others, 'status': value}
                with self.subTest(base=base, status=value):
                    self.assertEqual(count, self._list_count(params))
            others = {k: v for k, v in base.items() if k not in PAYMENT_KEYS}
            for value, count in data['payment'].items():
                with self.subTest(base=base, payment=value):
                    self.assertEqual(count, self._list_count({**others, **payment_params[value]}))  # noqa: E501

    def test_search_applies_to_both_menus(self):
        data = self._facets('?search=Bachir')
        self.assertEqual(data['status']['all'], 2)
        self.assertEqual(data['payment'], {'all': 2, 'due': 1, 'paid': 1})

    def test_other_shop_sees_only_its_orders(self):
        self.client.force_authenticate(user=User.objects.get(email='facets_b@example.com'))
        data = self._facets()
        self.assertEqual(data['status']['all'], 3)
        self.assertEqual(data['status']['shipped'], 3)
        self.assertEqual(data['payment'], {'all': 3, 'due': 0, 'paid': 3})

    def test_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse('order-facets'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
