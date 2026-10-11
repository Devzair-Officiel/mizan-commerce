from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import datetime, timedelta, timezone as dt_timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.customers.models import Customer
from .models import Note, Reminder
from .services import reminders_in_scope, reminders_to_do, todo_cutoff


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
        Note.objects.create(shop=self.shop, author=self.user, content='Note A', customer=self.customer)  # noqa: E501
        Note.objects.create(shop=self.shop, author=self.user, content='Note B')
        response = self.client.get(reverse('note-list') + f'?customer={self.customer.pk}')  # noqa: E501
        self.assertEqual(response.data['count'], 1)

    def test_delete_note(self):
        note = Note.objects.create(shop=self.shop, author=self.user, content='À supprimer')  # noqa: E501
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
        Reminder.objects.create(shop=self.shop, author=self.user, title='En attente', due_at=timezone.now() + timedelta(days=1))  # noqa: E501
        Reminder.objects.create(shop=self.shop, author=self.user, title='Terminé', due_at=timezone.now(), status='done')  # noqa: E501
        response = self.client.get(reverse('reminder-list'))
        titles = [r['title'] for r in response.data['results']]
        self.assertIn('En attente', titles)
        self.assertNotIn('Terminé', titles)

    def test_mark_done(self):
        reminder = Reminder.objects.create(
            shop=self.shop, author=self.user,
            title='À faire', due_at=timezone.now() + timedelta(days=1),
        )
        response = self.client.post(reverse('reminder-done', kwargs={'pk': reminder.pk}))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reminder.refresh_from_db()
        self.assertEqual(reminder.status, 'done')
        self.assertIsNotNone(reminder.done_at)

    def test_multitenant_isolation(self):
        user_b, shop_b, _ = setup('b@example.com')
        r_b = Reminder.objects.create(shop=shop_b, author=user_b, title='Rappel B', due_at=timezone.now() + timedelta(days=1))  # noqa: E501
        response = self.client.get(reverse('reminder-detail', kwargs={'pk': r_b.pk}))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unknown_scope_is_refused(self):
        response = self.client.get(reverse('reminder-list') + '?scope=pending')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


def utc(day: int, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """Instant UTC en mars 2026 (Tokyo = UTC+9, sans heure d'été)."""
    return datetime(2026, 3, day, hour, minute, second, tzinfo=dt_timezone.utc)


class ReminderToDoTest(TestCase):
    """« À faire » : en attente, échu avant le minuit qui termine la journée en cours,
    dans le fuseau de la boutique."""

    def setUp(self):
        self.user, self.shop, _ = setup('todo@example.com')
        Shop.objects.filter(pk=self.shop.pk).update(timezone='Asia/Tokyo')
        self.shop.refresh_from_db()

    def remind(self, due_at, **kwargs):
        return Reminder.objects.create(shop=self.shop, author=self.user, title='Rappel', due_at=due_at, **kwargs)  # noqa: E501

    def test_cutoff_is_local_midnight(self):
        # 15 h 30 UTC le 10 = 0 h 30 le 11 à Tokyo : la journée finit le 12 à 0 h.
        self.assertEqual(todo_cutoff(self.shop, utc(10, 15, 30)), utc(11, 15))

    def test_today_in_shop_timezone(self):
        now = utc(10, 15, 30)  # le 11, 0 h 30 à Tokyo
        overdue = self.remind(utc(10, 14))  # le 10, 23 h
        late_today = self.remind(utc(11, 14, 59))  # le 11, 23 h 59
        midnight = self.remind(utc(11, 15))  # le 12, 0 h
        self.remind(utc(10, 14), status='done')
        self.assertEqual(set(reminders_to_do(self.shop, now)), {overdue, late_today})
        upcoming = reminders_in_scope(self.shop, 'upcoming', now)
        self.assertEqual(list(upcoming), [midnight])

    def test_midnight_moves_tomorrow_into_today(self):
        tomorrow = self.remind(utc(11, 16))  # le 12, 1 h
        self.assertNotIn(tomorrow, reminders_to_do(self.shop, utc(11, 14, 59, 59)))
        self.assertIn(tomorrow, reminders_to_do(self.shop, utc(11, 15)))


class ReminderCountsTest(TestCase):
    """Le badge, l'accueil et l'onglet « À faire » donnent le même chiffre."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, _ = setup('counts@example.com')
        self.client.force_authenticate(user=self.user)
        cutoff = todo_cutoff(self.shop)
        for due_at, state in (
            (timezone.now() - timedelta(days=3), 'pending'),
            (cutoff - timedelta(minutes=1), 'pending'),
            (cutoff + timedelta(minutes=1), 'pending'),
            (cutoff + timedelta(days=5), 'pending'),
            (timezone.now() - timedelta(days=1), 'done'),
        ):
            Reminder.objects.create(shop=self.shop, author=self.user, title='Rappel', due_at=due_at, status=state)  # noqa: E501

    def count(self, scope):
        return self.client.get(reverse('reminder-list') + f'?scope={scope}').data['count']  # noqa: E501

    def test_badge_dashboard_and_tab_agree(self):
        badge = self.client.get(reverse('dashboard-badges')).data['reminders_due']
        dashboard = self.client.get(reverse('dashboard-today')).data['today_reminders']['count']  # noqa: E501
        self.assertEqual((badge, dashboard, self.count('todo')), (2, 2, 2))
        self.assertEqual((self.count('upcoming'), self.count('done')), (2, 1))


class ExistingFollowupTest(TestCase):
    """« Marquer à relancer » retrouve le rappel de relance en attente du client."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.shop, self.customer = setup('followup@example.com')
        self.client.force_authenticate(user=self.user)
        self.due = timezone.now() + timedelta(days=1)

    def remind(self, **kwargs):
        values = {'shop': self.shop, 'author': self.user, 'title': 'Relance', 'due_at': self.due, 'category': 'customer_followup', 'customer': self.customer} | kwargs  # noqa: E501
        return Reminder.objects.create(**values)

    def find(self):
        url = reverse('reminder-list') + f'?customer={self.customer.pk}&category=customer_followup'  # noqa: E501
        return [r['id'] for r in self.client.get(url).data['results']]

    def test_finds_pending_followup_of_the_customer_only(self):
        existing = self.remind()
        other = Customer.objects.create(shop=self.shop, name='Autre client')
        self.remind(customer=other)
        self.remind(category='unpaid')
        self.remind(status='done')
        _, shop_b, customer_b = setup('followup_b@example.com')
        self.remind(shop=shop_b, customer=customer_b)
        self.assertEqual(self.find(), [str(existing.pk)])

    def test_overdue_followup_is_found(self):
        existing = self.remind(due_at=timezone.now() - timedelta(days=4))
        self.assertEqual(self.find(), [str(existing.pk)])

    def test_none_when_no_pending_followup(self):
        self.remind(status='done')
        self.assertEqual(self.find(), [])

    def test_postpone_moves_the_existing_reminder(self):
        existing = self.remind()
        later = timezone.now() + timedelta(days=3)
        response = self.client.patch(reverse('reminder-detail', kwargs={'pk': existing.pk}), {'due_at': later.isoformat()}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Reminder.objects.filter(customer=self.customer, status='pending').count(), 1)  # noqa: E501
        existing.refresh_from_db()
        self.assertEqual(existing.due_at, later)
