"""Page Rappels : recherche, compteurs des onglets et des groupes, moment de
chaque rappel, client et commande affichés, tri des terminés."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.orders.factories import OrderFactory
from .models import Reminder
from .services import moment_bounds
from .tests import setup


class ReminderPageTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.customer = setup('page@example.com')
        self.client.force_authenticate(user=self.user)
        today, tomorrow, after_tomorrow, week_end = moment_bounds(self.shop)
        self.nadia = Customer.objects.create(
            shop=self.shop, first_name='Nadia', name='El Fassi', phone='+212600000000',
        )
        self.order = OrderFactory(
            shop=self.shop, customer=self.nadia,
            total_amount=Decimal('80'), amount_paid=Decimal('20'), payment_status='partial',  # noqa: E501
        )
        self.overdue = self.remind('Relancer Nadia', today - timedelta(hours=1),
                                   customer=self.nadia, order=self.order,
                                   category='customer_followup')
        self.today = self.remind('Appeler Lin & Co', today + timedelta(hours=10))
        self.tomorrow = self.remind('Préparer le samedi', tomorrow + timedelta(hours=9))
        self.week = self.remind('Inventaire', after_tomorrow + timedelta(hours=9))
        self.later = self.remind(
            'Zakat', week_end + timedelta(hours=1), category='zakat',
        )
        now = timezone.now()
        self.done_old = self.remind('Ancien', now, status='done', done_at=now - timedelta(days=2))  # noqa: E501
        self.done_new = self.remind('Récent', now, status='done', done_at=now - timedelta(hours=1))  # noqa: E501
        self.remind('Supprimé', now, status='dismissed')

    def remind(self, title, due_at, **fields):
        return Reminder.objects.create(shop=self.shop, title=title, due_at=due_at, **fields)  # noqa: E501

    def results(self, query):
        return self.client.get(reverse('reminder-list') + query).data['results']

    def summary(self, query=''):
        return self.client.get(reverse('reminder-summary') + query).data

    def test_summary_counts(self):
        self.assertEqual(self.summary(), {
            'overdue': 1, 'todo': 2, 'upcoming': 3,
            'tomorrow': 1, 'this_week': 1, 'done': 2,
        })

    def test_summary_applies_the_filters(self):
        counts = self.summary('?search=nadia')
        self.assertEqual(
            (counts['todo'], counts['upcoming'], counts['done']), (1, 0, 0),
        )
        counts = self.summary('?category=zakat')
        self.assertEqual((counts['todo'], counts['upcoming']), (0, 1))

    def test_moment_of_each_reminder(self):
        moments = {r['title']: r['moment'] for r in self.results('')}
        self.assertEqual(moments, {
            'Relancer Nadia': 'overdue', 'Appeler Lin & Co': 'today',
            'Préparer le samedi': 'tomorrow', 'Inventaire': 'week', 'Zakat': 'later',
        })

    def test_search_on_title_and_customer(self):
        self.assertEqual([r['title'] for r in self.results('?search=lin')], ['Appeler Lin & Co'])  # noqa: E501
        self.assertEqual(
            [r['title'] for r in self.results('?search=nadia fassi')],
            ['Relancer Nadia'],
        )

    def test_customer_and_order_are_displayed(self):
        row = self.results('?scope=todo')[0]
        self.assertEqual(row['customer_info']['display_name'], 'Nadia El Fassi')
        self.assertEqual(row['customer_info']['phone'], '+212600000000')
        self.assertEqual(row['order_info']['order_number'], self.order.order_number)
        self.assertEqual(
            (row['order_info']['total_amount'], row['order_info']['amount_paid']),
            ('80.00', '20.00'),
        )
        self.assertIsNone(self.results('?scope=todo')[1]['order_info'])

    def test_filter_by_order(self):
        rows = self.results(f'?order={self.order.pk}')
        self.assertEqual([r['title'] for r in rows], ['Relancer Nadia'])

    def test_done_newest_first(self):
        rows = self.results('?scope=done&ordering=-done_at')
        self.assertEqual([r['title'] for r in rows], ['Récent', 'Ancien'])

    def test_counts_are_scoped_to_the_shop(self):
        user_b, shop_b, _ = setup('page-b@example.com')
        Reminder.objects.create(shop=shop_b, title='Rappel B', due_at=timezone.now())
        self.client.force_authenticate(user=user_b)
        self.assertEqual(self.summary()['todo'], 1)
        self.assertEqual(self.summary('?search=nadia')['todo'], 0)


class ReminderLinkTest(TestCase):
    """La commande liée appartient au client lié (création et modification)."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.customer = setup('link@example.com')
        self.client.force_authenticate(user=self.user)
        self.other = Customer.objects.create(shop=self.shop, name='Autre client')
        self.order = OrderFactory(shop=self.shop, customer=self.customer)
        self.due = timezone.now() + timedelta(days=1)

    def post(self, **fields):
        return self.client.post(
            reverse('reminder-list'),
            {'title': 'Relancer', 'due_at': self.due, **fields}, format='json',
        )

    def test_order_of_the_customer_is_accepted(self):
        response = self.post(customer=str(self.customer.pk), order=str(self.order.pk))
        self.assertEqual(response.status_code, 201)

    def test_order_of_another_customer_is_refused(self):
        response = self.post(customer=str(self.other.pk), order=str(self.order.pk))
        self.assertEqual(response.status_code, 400)
        self.assertIn('order', response.data['errors'])

    def test_patch_customer_checks_the_linked_order(self):
        reminder = Reminder.objects.create(
            shop=self.shop, title='Relancer', due_at=self.due,
            customer=self.customer, order=self.order,
        )
        url = reverse('reminder-detail', args=[reminder.pk])
        response = self.client.patch(
            url, {'customer': str(self.other.pk)}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        # Retirer la commande en même temps : accepté.
        response = self.client.patch(
            url, {'customer': str(self.other.pk), 'order': None}, format='json',
        )
        self.assertEqual(response.status_code, 200)
