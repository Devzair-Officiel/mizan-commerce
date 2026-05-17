from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.customers.models import Customer
from apps.orders.models import Order
from apps.orders import services as order_services
from apps.products.models import Product
from apps.stock.models import StockMovement
from .models import Note, Reminder


def setup(email):
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    customer = Customer.objects.create(shop=shop, name='Client test')
    return user, shop, customer


class NoteTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.customer = setup('notes@example.com')
        self.client.force_authenticate(user=self.user)

    def test_create_free_note(self):
        response = self.client.post(reverse('note-list'), {'content': 'Note libre.'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_note_linked_to_customer(self):
        response = self.client.post(reverse('note-list'), {
            'content': 'Client à relancer.',
            'customer': str(self.customer.pk),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data['customer']), str(self.customer.pk))

    def test_filter_by_customer(self):
        Note.objects.create(shop=self.shop, author=self.user, content='Note A', customer=self.customer)
        Note.objects.create(shop=self.shop, author=self.user, content='Note B')
        response = self.client.get(reverse('note-list') + f'?customer={self.customer.pk}')
        self.assertEqual(response.data['count'], 1)

    def test_delete_note(self):
        note = Note.objects.create(shop=self.shop, author=self.user, content='À supprimer')
        response = self.client.delete(reverse('note-detail', kwargs={'pk': note.pk}))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_multitenant_isolation(self):
        user_b, shop_b, _ = setup('b@example.com')
        note_b = Note.objects.create(shop=shop_b, author=user_b, content='Note B')
        response = self.client.get(reverse('note-detail', kwargs={'pk': note_b.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ReminderTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.customer = setup('reminders@example.com')
        self.client.force_authenticate(user=self.user)
        self.due = (timezone.now() + timedelta(days=2)).isoformat()

    def test_create_reminder(self):
        response = self.client.post(reverse('reminder-list'), {
            'title': 'Relancer Karima',
            'due_at': self.due,
            'category': 'customer_followup',
            'customer': str(self.customer.pk),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_list_shows_pending_by_default(self):
        Reminder.objects.create(shop=self.shop, author=self.user, title='En attente', due_at=timezone.now() + timedelta(days=1))
        Reminder.objects.create(shop=self.shop, author=self.user, title='Terminé', due_at=timezone.now(), status='done')
        response = self.client.get(reverse('reminder-list'))
        titles = [r['title'] for r in response.data['results']]
        self.assertIn('En attente', titles)
        self.assertNotIn('Terminé', titles)

    def test_mark_done(self):
        reminder = Reminder.objects.create(
            shop=self.shop, author=self.user,
            title='À faire', due_at=timezone.now() + timedelta(days=1),
        )
        response = self.client.post(reverse('reminder-done', kwargs={'pk': reminder.pk}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reminder.refresh_from_db()
        self.assertEqual(reminder.status, 'done')
        self.assertIsNotNone(reminder.done_at)

    def test_multitenant_isolation(self):
        user_b, shop_b, _ = setup('b@example.com')
        r_b = Reminder.objects.create(shop=shop_b, author=user_b, title='Rappel B', due_at=timezone.now() + timedelta(days=1))
        response = self.client.get(reverse('reminder-detail', kwargs={'pk': r_b.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
