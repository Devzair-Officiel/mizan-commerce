from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.notes.models import Note
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.orders.models import Order
from .models import Customer
from .services import build_customers_summary


def setup(email):
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


def subscribe(shop: Shop, code: str) -> None:
    """Formule active de la boutique (sans souscription : Gratuit)."""
    Subscription.objects.update_or_create(shop=shop, defaults={
        'plan': SubscriptionPlan.objects.get(code=code),
        'status': Subscription.STATUS_ACTIVE,
        'current_period_start': timezone.now(),
    })


class CustomerCRUDTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('seller@example.com')
        self.client.force_authenticate(user=self.user)

    def test_create_customer(self):
        response = self.client.post(reverse('customer-list'), {'name': 'Mohammed Ali', 'phone': '+33600000000'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_list_active_only_by_default(self):
        Customer.objects.create(shop=self.shop, name='Actif')
        Customer.objects.create(shop=self.shop, name='Inactif', is_active=False)
        response = self.client.get(reverse('customer-list'))
        names = [c['name'] for c in response.data['results']]
        self.assertIn('Actif', names)
        self.assertNotIn('Inactif', names)

    def test_soft_delete(self):
        c = Customer.objects.create(shop=self.shop, name='À archiver')
        response = self.client.delete(reverse('customer-detail', kwargs={'pk': c.pk}))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        c.refresh_from_db()
        self.assertFalse(c.is_active)

    def test_search_by_name(self):
        Customer.objects.create(shop=self.shop, name='Youssef')
        Customer.objects.create(shop=self.shop, name='Fatima')
        response = self.client.get(reverse('customer-list') + '?search=yous')
        names = [c['name'] for c in response.data['results']]
        self.assertIn('Youssef', names)
        self.assertNotIn('Fatima', names)


class CustomerMultiTenantTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_a, self.shop_a = setup('a@example.com')
        self.user_b, self.shop_b = setup('b@example.com')
        self.customer_b = Customer.objects.create(shop=self.shop_b, name='Client B')

    def test_user_a_cannot_access_customer_b(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(reverse('customer-detail', kwargs={'pk': self.customer_b.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CustomerListServerSideTest(TestCase):
    """Situation, tri, indicateurs et facettes calculés côté serveur (URS-031)."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('list@example.com')
        self.client.force_authenticate(user=self.user)
        now = timezone.now()
        # Ali : 2 commandes dont une impayée (reste 30), plus une annulée ignorée.
        self.ali = Customer.objects.create(shop=self.shop, name='Ali', city='Lyon')
        self._order(self.ali, '100', '100', 'paid', days_ago=10)
        self._order(self.ali, '50', '20', 'partial', days_ago=2)
        self._order(self.ali, '999', '0', 'unpaid', days_ago=1, status_='cancelled')
        # Béa : une commande payée, plus ancienne.
        self.bea = Customer.objects.create(shop=self.shop, name='Béa')
        self._order(self.bea, '300', '300', 'paid', days_ago=20)
        # Chloé : sans commande. Driss : désactivé avec un impayé.
        self.chloe = Customer.objects.create(shop=self.shop, name='Chloé')
        self.driss = Customer.objects.create(
            shop=self.shop, name='Driss', is_active=False,
        )
        self._order(self.driss, '40', '0', 'unpaid', days_ago=5)
        # Emma : créée le mois dernier, sans commande.
        self.emma = Customer.objects.create(shop=self.shop, name='Emma')
        Customer.objects.filter(pk=self.emma.pk).update(
            created_at=now - timedelta(days=40),
        )
        # Une autre boutique, jamais visible.
        _, other = setup('other@example.com')
        intruder = Customer.objects.create(shop=other, name='Intrus')
        self._order(intruder, '500', '0', 'unpaid', days_ago=1, shop=other)

    def _order(self, customer, total, paid, payment, *, days_ago, status_='shipped', shop=None):  # noqa: E501
        order = Order.objects.create(
            shop=shop or self.shop, customer=customer, order_number=f'N-{Order.objects.count()}',  # noqa: E501
            status=status_, payment_status=payment,
            total_amount=Decimal(total), amount_paid=Decimal(paid),
        )
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(days=days_ago))  # noqa: E501
        return order

    def _names(self, **params):
        response = self.client.get(reverse('customer-list'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [c['name'] for c in response.data['results']]

    def test_situations(self):
        self.assertEqual(self._names(situation='all'), ['Ali', 'Béa', 'Chloé', 'Driss', 'Emma'])  # noqa: E501
        self.assertEqual(
            self._names(situation='active'), ['Ali', 'Béa', 'Chloé', 'Emma'],
        )
        self.assertEqual(self._names(), ['Ali', 'Béa', 'Chloé', 'Emma'])
        self.assertEqual(self._names(situation='pending'), ['Ali', 'Driss'])
        self.assertEqual(self._names(situation='deactivated'), ['Driss'])

    def test_period_month(self):
        self.assertNotIn('Emma', self._names(situation='all', period='month'))

    def test_list_fields(self):
        response = self.client.get(reverse('customer-list'), {'search': 'Ali'})
        ali = response.data['results'][0]
        self.assertEqual(ali['order_count'], 2)
        self.assertEqual(ali['pending_amount'], '30.00')
        self.assertEqual(ali['paid_amount'], '120.00')
        self.assertIsNotNone(ali['last_order_at'])
        chloe = self.client.get(reverse('customer-list'), {'search': 'Chlo'}).data['results'][0]  # noqa: E501
        self.assertEqual((chloe['order_count'], chloe['pending_amount'], chloe['last_order_at']), (0, '0.00', None))  # noqa: E501

    def test_ordering_name_and_created_at(self):
        self.assertEqual(self._names(situation='all', ordering='-name'), ['Emma', 'Driss', 'Chloé', 'Béa', 'Ali'])  # noqa: E501
        self.assertEqual(self._names(situation='all', ordering='created_at')[0], 'Emma')
        names = self._names(situation='all', ordering='-created_at')
        self.assertEqual(names[-1], 'Emma')

    def test_order_derived_orderings_put_customers_without_orders_last(self):
        expected = {
            'pending_amount': ['Béa', 'Ali', 'Driss'],
            '-pending_amount': ['Driss', 'Ali', 'Béa'],
            'paid_amount': ['Driss', 'Ali', 'Béa'],
            '-paid_amount': ['Béa', 'Ali', 'Driss'],
            'order_count': ['Béa', 'Driss', 'Ali'],
            '-order_count': ['Ali', 'Béa', 'Driss'],
            'last_order_at': ['Béa', 'Driss', 'Ali'],
            '-last_order_at': ['Ali', 'Driss', 'Béa'],
        }
        for ordering, with_orders in expected.items():
            with self.subTest(ordering=ordering):
                self.assertEqual(self._names(situation='all', ordering=ordering), with_orders + ['Chloé', 'Emma'])  # noqa: E501

    def test_summary(self):
        data = self.client.get(reverse('customer-summary')).data
        self.assertEqual(data['active'], {'count': 4})
        self.assertEqual(data['due'], {'count': 2, 'amount': '70.00'})
        self.assertEqual(data['new_this_month'], {'count': 4})

    def test_summary_new_this_month_uses_shop_timezone(self):
        # 31 mars 23 h 30 UTC = 1er avril 1 h 30 à Paris : client d'avril.
        Customer.objects.filter(shop=self.shop).update(created_at=datetime(2026, 3, 31, 23, 30, tzinfo=dt_timezone.utc))  # noqa: E501
        now = datetime(2026, 4, 15, 12, 0, tzinfo=dt_timezone.utc)
        self.assertEqual(build_customers_summary(self.shop, now)['new_this_month']['count'], 5)  # noqa: E501

    def test_facets_match_list(self):
        for params in ({}, {'search': 'a'}, {'period': 'month'}):
            response = self.client.get(reverse('customer-facets'), params)
            facets = response.data['situation']
            for situation in ('all', 'active', 'pending', 'deactivated'):
                with self.subTest(params=params, situation=situation):
                    response = self.client.get(reverse('customer-list'), {**params, 'situation': situation})  # noqa: E501
                    self.assertEqual(facets[situation], response.data['count'])

    def test_more_than_one_page(self):
        for i in range(25):
            Customer.objects.create(shop=self.shop, name=f'Zed {i:02d}')
        first = self.client.get(reverse('customer-list'), {'situation': 'all'}).data
        self.assertEqual(first['count'], 30)
        second = self.client.get(reverse('customer-list'), {'situation': 'all', 'page': 2}).data  # noqa: E501
        names = [c['name'] for c in first['results'] + second['results']]
        self.assertEqual(len(set(names)), 30)
        self.assertEqual(self.client.get(reverse('customer-facets')).data['situation']['all'], 30)  # noqa: E501
        self.assertEqual(self.client.get(reverse('customer-summary')).data['active']['count'], 29)  # noqa: E501

    def test_other_shop_never_counted(self):
        self.assertNotIn('Intrus', self._names(situation='all'))
        self.assertNotIn('Intrus', self._names(situation='pending'))
        self.assertEqual(self.client.get(reverse('customer-facets')).data['situation']['all'], 5)  # noqa: E501
        self.assertEqual(self.client.get(reverse('customer-summary')).data['due']['amount'], '70.00')  # noqa: E501


class CustomerPhoneTest(TestCase):
    """Numéros enregistrés au format E.164, avec le pays de la boutique par défaut."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('phone@example.com')
        self.shop.country = 'FR'
        self.shop.save()
        self.client.force_authenticate(user=self.user)

    def create(self, phone: str):
        return self.client.post(
            reverse('customer-list'), {'name': 'Client tel', 'phone': phone},
        )

    def test_french_national_number(self):
        response = self.create('06 12 34 56 78')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['phone'], '+33612345678')
        self.assertEqual(response.data['phone_display'], '+33 6 12 34 56 78')

    def test_moroccan_number_with_moroccan_shop(self):
        self.shop.country = 'MA'
        self.shop.save()
        response = self.create('0661-23-45-67')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['phone'], '+212661234567')

    def test_international_number_keeps_its_country(self):
        response = self.create('+212 661 23 45 67')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['phone'], '+212661234567')

    def test_invalid_number_is_refused(self):
        response = self.create('12345')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['errors']['phone'], ['Numéro de téléphone invalide'],
        )
        self.assertFalse(Customer.objects.filter(shop=self.shop).exists())

    def test_empty_number_stays_empty(self):
        response = self.create('')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['phone'], '')

    def test_update_normalizes(self):
        c = Customer.objects.create(shop=self.shop, name='À modifier')
        response = self.client.patch(
            reverse('customer-detail', kwargs={'pk': c.pk}), {'phone': '0698765432'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        c.refresh_from_db()
        self.assertEqual(c.phone, '+33698765432')


class NormalizePhonesMigrationTest(TestCase):
    """Migration 0004 : normalise l'existant, sans effet si on la relance."""

    def run_migration(self) -> str:
        import importlib
        import io
        from contextlib import redirect_stdout

        from django.apps import apps

        module = importlib.import_module(
            'apps.customers.migrations.0004_normalize_customer_phones',
        )
        out = io.StringIO()
        with redirect_stdout(out):
            module.normalize_customer_phones(apps, None)
        return out.getvalue()

    def test_normalizes_and_is_idempotent(self):
        _, fr = setup('mig-fr@example.com')
        fr.country = 'FR'
        fr.save()
        _, ma = setup('mig-ma@example.com')
        ma.country = 'MA'
        ma.save()
        national = Customer.objects.create(shop=fr, name='A', phone='06 12 34 56 78')
        moroccan = Customer.objects.create(shop=ma, name='B', phone='0661234567')
        done = Customer.objects.create(shop=fr, name='C', phone='+212661234567')
        broken = Customer.objects.create(shop=fr, name='D', phone='abc 12')

        output = self.run_migration()
        for c in (national, moroccan, done, broken):
            c.refresh_from_db()
        self.assertEqual(national.phone, '+33612345678')
        self.assertEqual(moroccan.phone, '+212661234567')
        self.assertEqual(done.phone, '+212661234567')
        self.assertEqual(broken.phone, 'abc 12')
        self.assertIn("'abc 12'", output)

        self.run_migration()
        national.refresh_from_db()
        self.assertEqual(national.phone, '+33612345678')


class CustomerDisplayNameTest(TestCase):
    """Nom complet du client (`display_name`) partout où il est nommé ; recherche
    sur le prénom, le nom ou les deux."""

    def setUp(self):
        from apps.orders import services as order_services
        from apps.subscriptions.test_utils import attach_subscription

        self.client = APIClient()
        self.user, self.shop = setup('display@example.com')
        attach_subscription(self.shop)  # Plan Pro requis pour les commandes.
        self.client.force_authenticate(user=self.user)
        self.karima = Customer.objects.create(shop=self.shop, first_name='Karima', name='Bensouda')  # noqa: E501
        self.ali = Customer.objects.create(shop=self.shop, name='Ali  Haddad')
        self.order = order_services.create_order(self.shop, self.user, customer=self.karima)  # noqa: E501
        # Une autre boutique, avec le même prénom : jamais visible.
        _, other = setup('display-other@example.com')
        Customer.objects.create(shop=other, first_name='Karima', name='Intruse')

    def _list(self, **params) -> list[str]:
        response = self.client.get(reverse('customer-list'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [c['display_name'] for c in response.data['results']]

    def test_display_name_with_and_without_first_name(self):
        self.assertEqual(self.karima.display_name, 'Karima Bensouda')
        self.assertEqual(self.ali.display_name, 'Ali Haddad')
        self.assertEqual(Customer(first_name='  Karima ', name=' Bensouda  Test ').display_name, 'Karima Bensouda Test')  # noqa: E501
        detail = self.client.get(reverse('customer-detail', kwargs={'pk': self.karima.pk}))  # noqa: E501
        self.assertEqual(detail.data['display_name'], 'Karima Bensouda')
        self.assertEqual(self._list(), ['Ali Haddad', 'Karima Bensouda'])

    def test_display_name_is_read_only(self):
        url = reverse('customer-detail', kwargs={'pk': self.karima.pk})
        self.client.patch(url, {'display_name': 'Autre'}, format='json')
        self.karima.refresh_from_db()
        self.assertEqual(self.karima.display_name, 'Karima Bensouda')

    def test_search_on_first_name_name_and_both(self):
        for query in ('Karima', 'bensouda', 'Karima Bens', 'Bensouda Karima'):
            self.assertEqual(self._list(search=query), ['Karima Bensouda'], query)
        self.assertEqual(self._list(search='Karima Haddad'), [])

    def test_sort_by_name_then_first_name(self):
        self.assertEqual(self._list(ordering='-name'), ['Karima Bensouda', 'Ali Haddad'])  # noqa: E501
        self.assertEqual(self._list(ordering='name'), ['Ali Haddad', 'Karima Bensouda'])  # noqa: E501

    def test_orders_show_and_find_full_name(self):
        detail = self.client.get(reverse('order-detail', kwargs={'pk': self.order.pk}))
        self.assertEqual(detail.data['customer_name'], 'Karima Bensouda')
        self.assertEqual(detail.data['customer_first_name'], 'Karima')
        for query in ('Karima', 'Karima Bens'):
            results = self.client.get(reverse('order-list'), {'search': query}).data['results']  # noqa: E501
            self.assertEqual([o['customer_name'] for o in results], ['Karima Bensouda'], query)  # noqa: E501

    def test_global_search_and_home(self):
        data = self.client.get(reverse('global-search'), {'q': 'Karima Bens'}).data
        self.assertEqual([c['display_name'] for c in data['customers']['items']], ['Karima Bensouda'])  # noqa: E501
        self.assertEqual([o['customer_name'] for o in data['orders']['items']], ['Karima Bensouda'])  # noqa: E501
        home = self.client.get(reverse('dashboard-today')).data
        names = [o['customer_name'] for o in home['orders_to_prepare']['items']]
        self.assertEqual(names, ['Karima Bensouda'])

    def test_prepared_message_names_full_name(self):
        from apps.comms import services as comms_services
        from apps.comms.models import PreparedMessage

        message = comms_services.prepare_message(
            shop=self.shop, user=self.user,
            template_type=PreparedMessage.TemplateType.ORDER_CONFIRMATION,
            context_type=PreparedMessage.ContextType.ORDER, context_id=self.order.pk,
        )
        self.assertEqual(message.recipient_name, 'Karima Bensouda')
        self.assertTrue(message.message.startswith('Bonjour Karima 😊'))


class CustomerActivityWindowTest(TestCase):
    """Activité du client par fenêtre (`limit`, `offset`) : jamais chargée en entier."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('activity@example.com')
        self.client.force_authenticate(user=self.user)
        self.customer = Customer.objects.create(shop=self.shop, name='Habitué')
        self.base = timezone.now() - timedelta(days=30)
        # 6 commandes (création + paiement : 12 événements), 3 notes, dates distinctes.
        self.orders = []
        for i in range(6):
            order = Order.objects.create(shop=self.shop, customer=self.customer, order_number=f'A-{i}')  # noqa: E501
            Order.objects.filter(pk=order.pk).update(created_at=self.base + timedelta(days=i))  # noqa: E501
            self.orders.append(order)
        for i in range(3):
            note = Note.objects.create(shop=self.shop, customer=self.customer, content=f'Note {i}')  # noqa: E501
            Note.objects.filter(pk=note.pk).update(created_at=self.base + timedelta(days=i, hours=12))  # noqa: E501
        self.url = reverse('customer-activity', kwargs={'pk': self.customer.pk})

    def ids(self, **params) -> list[str]:
        return [e['id'] for e in self.client.get(self.url, params).data['results']]

    def test_windows_follow_the_full_timeline(self):
        full = self.client.get(self.url, {'limit': 100}).data
        self.assertEqual(full['count'], 15)
        dates = [e['occurred_at'] for e in full['results']]
        self.assertEqual(dates, sorted(dates, reverse=True))
        first = self.client.get(self.url, {'limit': 5}).data
        self.assertEqual((first['count'], len(first['results'])), (15, 5))
        more = self.client.get(self.url, {'limit': 10, 'offset': 5}).data
        self.assertIsNone(more['next'])
        self.assertEqual([e['id'] for e in first['results'] + more['results']], [e['id'] for e in full['results']])  # noqa: E501

    def test_payment_dated_by_its_latest_log(self):
        oldest = self.orders[0]
        AuditLog.objects.create(
            shop_id=self.shop.id, action='order_payment_change', model_name='Order',
            object_id=str(oldest.pk), object_repr='A-0', changes={'to': 'paid'},
        )
        self.assertEqual(self.ids(limit=1), [f'payment-{oldest.pk}'])

    def test_filter_and_pending_keep_the_window(self):
        notes = self.client.get(self.url, {'types': 'note', 'limit': 2}).data
        self.assertEqual(notes['count'], 3)
        self.assertEqual(len(notes['results']), 2)
        self.assertTrue(all(e['type'] == 'note' for e in notes['results']))
        Order.objects.filter(pk__in=[o.pk for o in self.orders[:4]]).update(payment_status='paid')  # noqa: E501
        pending = self.client.get(self.url, {'types': 'order', 'pending': 'true', 'limit': 5}).data  # noqa: E501
        self.assertEqual(pending['count'], 2)
        self.assertEqual({e['data']['order_number'] for e in pending['results']}, {'A-4', 'A-5'})  # noqa: E501

    def test_unknown_type_rejected(self):
        response = self.client.get(self.url, {'types': 'order,bogus'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_other_shop_isolated(self):
        user_b, shop_b = setup('other-activity@example.com')
        customer_b = Customer.objects.create(shop=shop_b, name='Client B')
        url_b = reverse('customer-activity', kwargs={'pk': customer_b.pk})
        self.assertEqual(self.client.get(url_b).status_code, status.HTTP_404_NOT_FOUND)
        # Un journal d'une autre boutique ne date pas le paiement de nos commandes.
        AuditLog.objects.create(
            shop_id=shop_b.id, action='order_payment_change', model_name='Order',
            object_id=str(self.orders[0].pk), object_repr='A-0', changes={'to': 'paid'},
        )
        self.assertNotIn(f'payment-{self.orders[0].pk}', self.ids(limit=1))


class CustomerActivityExportTest(TestCase):
    """Export CSV de l'activité : types, période, format, droits, journal d'audit."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup('export@example.com')
        # Export réservé à la formule Pro (et au-delà).
        subscribe(self.shop, SubscriptionPlan.CODE_PRO)
        User.objects.filter(pk=self.user.pk).update(full_name='Youssef Benali')
        self.user.refresh_from_db()
        Shop.objects.filter(pk=self.shop.pk).update(timezone='Europe/Paris')
        self.shop.refresh_from_db()
        self.client.force_authenticate(user=self.user)
        self.customer = Customer.objects.create(shop=self.shop, first_name='Karima', name='Bensouda')  # noqa: E501
        self.recent = self._order('C-1', '1234.50', paid='1000.00', payment='partial', when=datetime(2026, 9, 30, 21, 30, tzinfo=dt_timezone.utc))  # noqa: E501
        self.old = self._order('C-0', '20.00', when=datetime(2024, 5, 1, 9, 0, tzinfo=dt_timezone.utc))  # noqa: E501
        note = Note.objects.create(shop=self.shop, customer=self.customer, order=self.recent, author=self.user, content='=SOMME(A1:A2)')  # noqa: E501
        Note.objects.filter(pk=note.pk).update(created_at=datetime(2026, 10, 2, 8, 0, tzinfo=dt_timezone.utc))  # noqa: E501
        self.url = reverse('customer-activity-export', kwargs={'pk': self.customer.pk})
        self.summary_url = reverse('customer-activity-export-summary', kwargs={'pk': self.customer.pk})  # noqa: E501

    def _order(self, number, total, *, when, paid='0', payment='unpaid'):
        order = Order.objects.create(
            shop=self.shop, customer=self.customer, order_number=number, created_by=self.user,  # noqa: E501
            total_amount=Decimal(total), amount_paid=Decimal(paid), payment_status=payment,  # noqa: E501
        )
        Order.objects.filter(pk=order.pk).update(created_at=when)
        return order

    def _csv(self, **params) -> tuple[bytes, list[list[str]]]:
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = b''.join(response.streaming_content)
        lines = body.decode('utf-8-sig').splitlines()
        return body, [line.split(';') for line in lines]

    def test_free_plan_forbidden(self):
        subscribe(self.shop, SubscriptionPlan.CODE_FREE)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertEqual(self.client.get(self.summary_url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertFalse(AuditLog.objects.filter(action='customer_activity_export').exists())

    def test_pro_and_boutique_plus_get_csv(self):
        for code in (SubscriptionPlan.CODE_PRO, SubscriptionPlan.CODE_BOUTIQUE_PLUS):
            with self.subTest(code=code):
                subscribe(self.shop, code)
                _, rows = self._csv()
                self.assertEqual(len(rows), 6)
                self.assertEqual(self.client.get(self.summary_url).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_bom_separator_columns_and_filename(self):
        response = self.client.get(self.url)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('activite-karima-bensouda-', response['Content-Disposition'])
        body, rows = self._csv()
        self.assertTrue(body.startswith(b'\xef\xbb\xbf'))
        self.assertEqual(rows[0], ['Date', 'Type', 'Référence', 'Description', 'Montant', 'Statut', 'Auteur'])  # noqa: E501
        # 2 commandes + 2 paiements + 1 note, du plus récent au plus ancien.
        self.assertEqual(len(rows), 6)
        self.assertEqual([r[1] for r in rows[1:]], ['Note', 'Commande', 'Paiement', 'Commande', 'Paiement'])  # noqa: E501

    def test_each_type(self):
        _, rows = self._csv(types='order')
        # 21:30 UTC le 30 septembre : 23:30 à Paris, montant au format français.
        self.assertEqual(rows[1], ['2026-09-30 23:30', 'Commande', 'C-1', 'Commande créée', '1234,50', 'À préparer', 'Youssef Benali'])  # noqa: E501
        _, rows = self._csv(types='payment')
        self.assertEqual(rows[1][1:6], ['Paiement', 'C-1', 'Paiement partiel', '1000,00', 'Partiel'])  # noqa: E501
        _, rows = self._csv(types='note')
        # Formule neutralisée, référence de la commande liée.
        self.assertEqual(rows[1][1:], ['Note', 'C-1', "'=SOMME(A1:A2)", '', '', 'Youssef Benali'])  # noqa: E501
        Order.objects.filter(pk=self.old.pk).update(status='shipped')
        _, rows = self._csv(types='shipment')
        self.assertEqual(rows[1][1:6], ['Expédition', 'C-0', 'Expédition mise à jour', '', 'Expédiée'])  # noqa: E501

    def test_period_in_shop_timezone(self):
        # Le 30 septembre à 23:30 (Paris) est dans octobre en UTC+0 mais pas à Paris.
        _, rows = self._csv(types='order', **{'from': '2026-10-01', 'to': '2026-10-14'})
        self.assertEqual(len(rows), 1)
        _, rows = self._csv(types='order', **{'from': '2025-10-14', 'to': '2026-09-30'})
        self.assertEqual([r[2] for r in rows[1:]], ['C-1'])

    def test_user_language_decimal_format(self):
        User.objects.filter(pk=self.user.pk).update(language='en')
        self.user.refresh_from_db()
        _, rows = self._csv(types='order')
        self.assertEqual(rows[0][0], 'Date')
        self.assertEqual(rows[1][4], '1234.50')
        # La langue de l'interface l'emporte sur celle du compte.
        _, rows = self._csv(types='order', lang='fr')
        self.assertEqual((rows[0][4], rows[1][4]), ('Montant', '1234,50'))
        _, rows = self._csv(types='order', lang='ar')
        self.assertEqual((rows[0][0], rows[1][1], rows[1][4]), ('التاريخ', 'طلب', '1234.50'))  # noqa: E501

    def test_summary_counts_rows_before_download(self):
        data = self.client.get(self.summary_url, {'from': '2025-10-14'}).data
        self.assertEqual(data['counts'], {'order': 1, 'payment': 1, 'shipment': 0, 'note': 1})  # noqa: E501
        data = self.client.get(self.summary_url).data
        self.assertEqual(data['counts']['order'], 2)

    def test_invalid_filters_rejected(self):
        for params in ({'types': 'order,bogus'}, {'types': ''}, {'from': '2026-10-02', 'to': '2026-10-01'}, {'from': 'hier'}, {'lang': 'de'}):  # noqa: E501
            self.assertEqual(self.client.get(self.url, params).status_code, status.HTTP_400_BAD_REQUEST, params)  # noqa: E501

    def test_audit_log(self):
        self._csv(types='order,note', **{'from': '2025-10-14'})
        log = AuditLog.objects.get(action='customer_activity_export')
        self.assertEqual((log.shop_id, log.user, log.object_id), (self.shop.id, self.user, str(self.customer.pk)))  # noqa: E501
        self.assertEqual(log.changes, {'types': ['note', 'order'], 'pending': False, 'rows': 2, 'from': '2025-10-14', 'to': None})  # noqa: E501

    def test_rights_and_isolation(self):
        staff = User.objects.create_user(email='export-staff@example.com', password='Pass123!Strong')  # noqa: E501
        ShopMember.objects.create(shop=self.shop, user=staff, role='staff', permissions=['orders'])  # noqa: E501
        self.client.force_authenticate(user=staff)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertEqual(self.client.get(self.summary_url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        _, shop_b = setup('export-other@example.com')
        customer_b = Customer.objects.create(shop=shop_b, name='Client B')
        self.client.force_authenticate(user=self.user)
        url_b = reverse('customer-activity-export', kwargs={'pk': customer_b.pk})
        self.assertEqual(self.client.get(url_b).status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(AuditLog.objects.filter(action='customer_activity_export').exists())  # noqa: E501
