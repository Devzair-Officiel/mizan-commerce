"""Rappels automatiques (URS-055 à 057) : relances d'impayés, commandes en attente,
résumé du jour. Tâche horaire, à l'heure locale de chaque boutique."""

from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.orders.factories import OrderFactory
from apps.orders.models import Order
from apps.shops.models import Shop
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.test_utils import attach_subscription
from .models import Reminder
from .services import get_reminder_settings, run_automatic_reminders
from .tests import setup


def utc(day: int, hour: int, minute: int = 0) -> datetime:
    """Instant UTC en mars 2026 (Tokyo = UTC+9, sans heure d'été)."""
    return datetime(2026, 3, day, hour, minute, tzinfo=dt_timezone.utc)


# Le 10 mars, 9 h à Tokyo : dans la fenêtre du matin des commandes en attente.
NOW = utc(10, 0)


def automatic_shop(email: str, plan: str = SubscriptionPlan.CODE_SOLO):
    user, shop, customer = setup(email)
    attach_subscription(shop, plan_code=plan)
    Shop.objects.filter(pk=shop.pk).update(timezone='Asia/Tokyo')
    shop.refresh_from_db()
    return user, shop, customer


def make_order(shop, customer, days_ago: float, **fields) -> Order:
    order = OrderFactory(
        shop=shop, customer=customer, total_amount=Decimal('50'), **fields,
    )
    Order.objects.filter(pk=order.pk).update(created_at=NOW - timedelta(days=days_ago))
    return order


class UnpaidFollowupTest(TestCase):
    def setUp(self):
        self.user, self.shop, self.customer = automatic_shop('auto@example.com')
        self.order = make_order(self.shop, self.customer, days_ago=4)

    def followups(self):
        return Reminder.objects.filter(shop=self.shop, category='customer_followup')

    def test_creates_one_followup_per_unpaid_order(self):
        run_automatic_reminders(NOW)
        reminder = self.followups().get()
        self.assertEqual(
            (reminder.title, reminder.customer, reminder.order, reminder.assigned_to),
            ('Relancer Client test', self.customer, self.order, None),
        )
        self.assertTrue(reminder.is_automatic)

    def test_running_twice_creates_no_duplicate(self):
        run_automatic_reminders(NOW)
        run_automatic_reminders(NOW + timedelta(hours=1))
        self.assertEqual(self.followups().count(), 1)

    def test_only_orders_due_for_a_followup(self):
        make_order(self.shop, self.customer, days_ago=2)  # trop récente
        make_order(self.shop, self.customer, days_ago=5, payment_status='paid')
        make_order(self.shop, self.customer, days_ago=5, status='cancelled')
        make_order(self.shop, None, days_ago=5)  # sans client
        partial = make_order(self.shop, self.customer, days_ago=5, payment_status='partial')  # noqa: E501
        run_automatic_reminders(NOW)
        self.assertEqual(
            set(self.followups().values_list('order', flat=True)),
            {self.order.pk, partial.pk},
        )

    def test_skips_order_with_a_pending_followup(self):
        Reminder.objects.create(
            shop=self.shop, title='Déjà prévue', due_at=NOW, category='customer_followup',  # noqa: E501
            customer=self.customer, order=self.order,
        )
        run_automatic_reminders(NOW)
        self.assertEqual(self.followups().count(), 1)

    def test_not_recreated_after_deletion(self):
        run_automatic_reminders(NOW)
        reminder = self.followups().get()
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.delete(reverse('reminder-detail', kwargs={'pk': reminder.pk}))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        run_automatic_reminders(NOW + timedelta(hours=1))
        self.assertFalse(self.followups().filter(status='pending').exists())
        # Supprimé : invisible partout, même par son identifiant.
        listed = client.get(reverse('reminder-list') + '?scope=done').data['count']
        detail = client.get(reverse('reminder-detail', kwargs={'pk': reminder.pk}))
        self.assertEqual((listed, detail.status_code), (0, status.HTTP_404_NOT_FOUND))
        reopen = client.post(reverse('reminder-reopen', kwargs={'pk': reminder.pk}))
        self.assertEqual(reopen.status_code, status.HTTP_404_NOT_FOUND)

    def test_not_recreated_after_done(self):
        run_automatic_reminders(NOW)
        self.followups().update(status='done')
        run_automatic_reminders(NOW + timedelta(days=1))
        self.assertEqual(self.followups().count(), 1)

    def test_delay_and_switch_come_from_the_settings(self):
        config = get_reminder_settings(self.shop)
        config.unpaid_followup_days = 5
        config.save()
        run_automatic_reminders(NOW)
        self.assertFalse(self.followups().exists())
        config.unpaid_followup_days, config.unpaid_followup_enabled = 3, False
        config.save()
        run_automatic_reminders(NOW)
        self.assertFalse(self.followups().exists())

    def test_title_in_owner_language(self):
        self.user.language = 'ar'
        self.user.save()
        run_automatic_reminders(NOW)
        self.assertEqual(self.followups().get().title, 'متابعة Client test')

    def test_none_without_auto_reminders_in_the_plan(self):
        """Découverte a les commandes, pas la relance d'impayé (formule Solo)."""
        attach_subscription(self.shop, plan_code=SubscriptionPlan.CODE_FREE)
        run_automatic_reminders(NOW)
        self.assertFalse(self.followups().exists())

    def test_shops_are_isolated(self):
        _, shop_b, customer_b = automatic_shop('auto-b@example.com')
        order_b = make_order(shop_b, customer_b, days_ago=4)
        get_reminder_settings(shop_b)
        shop_b.reminder_settings.unpaid_followup_enabled = False
        shop_b.reminder_settings.save()
        run_automatic_reminders(NOW)
        self.assertEqual(self.followups().get().order, self.order)
        self.assertFalse(Reminder.objects.filter(order=order_b).exists())
        # Les commandes en attente de B ne comptent que pour B.
        self.assertEqual(
            Reminder.objects.get(shop=self.shop, category='order_prep').title,
            '1 commande à préparer depuis plus de 2 jours',
        )


class PendingOrdersTest(TestCase):
    def setUp(self):
        self.user, self.shop, self.customer = automatic_shop('pending@example.com')
        for _ in range(3):
            make_order(self.shop, self.customer, days_ago=3, payment_status='paid')
        make_order(self.shop, self.customer, days_ago=1, payment_status='paid')

    def pending(self):
        return Reminder.objects.filter(shop=self.shop, category='order_prep')

    def test_one_reminder_in_the_local_morning(self):
        run_automatic_reminders(utc(9, 22))  # le 10 à 7 h à Tokyo : trop tôt
        self.assertFalse(self.pending().exists())
        run_automatic_reminders(utc(9, 23))  # le 10 à 8 h à Tokyo
        run_automatic_reminders(utc(10, 0))
        reminder = self.pending().get()
        self.assertEqual(
            reminder.title, '3 commandes à préparer depuis plus de 2 jours',
        )
        self.assertTrue(reminder.is_automatic)

    def test_new_reminder_after_local_midnight(self):
        run_automatic_reminders(utc(9, 23))  # le 10 à 8 h à Tokyo
        run_automatic_reminders(utc(10, 23))  # le 11 à 8 h à Tokyo
        self.assertEqual(self.pending().count(), 2)

    def test_not_recreated_the_same_day_after_deletion(self):
        run_automatic_reminders(utc(9, 23))
        self.pending().update(status='dismissed')
        run_automatic_reminders(utc(10, 0))
        self.assertEqual(self.pending().count(), 1)

    def test_none_when_disabled_or_nothing_old(self):
        config = get_reminder_settings(self.shop)
        config.pending_orders_days = 4
        config.save()
        run_automatic_reminders(utc(9, 23))
        self.assertFalse(self.pending().exists())


class DailySummaryTest(TestCase):
    def setUp(self):
        self.user, self.shop, self.customer = automatic_shop(
            'summary@example.com', plan=SubscriptionPlan.CODE_BOUTIQUE,
        )
        self.user.full_name = 'Youssef'
        self.user.save()
        config = get_reminder_settings(self.shop)
        config.daily_summary_enabled = True
        config.save()
        make_order(self.shop, self.customer, days_ago=0)
        Reminder.objects.create(shop=self.shop, title='Appeler le fournisseur', due_at=utc(10, 1))  # noqa: E501
        Reminder.objects.create(shop=self.shop, title='Demain', due_at=utc(11, 1))

    def test_sent_once_at_the_local_hour(self):
        run_automatic_reminders(utc(9, 22))  # 7 h à Tokyo
        self.assertEqual(len(mail.outbox), 0)
        run_automatic_reminders(utc(9, 23))  # 8 h à Tokyo
        run_automatic_reminders(utc(9, 23, 30))
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['summary@example.com'])
        self.assertEqual(email.subject, f'Votre résumé du jour, {self.shop.name}')
        self.assertIn('Bonjour Youssef,', email.body)
        self.assertIn('1 commande à préparer', email.body)
        self.assertIn('1 commande impayée, 50,00', email.body)
        self.assertIn("1 rappel aujourd'hui", email.body)
        self.assertIn('Appeler le fournisseur', email.body)
        self.assertNotIn('Demain', email.body)
        self.assertNotIn('WhatsApp', email.body)

    def test_sent_again_the_next_local_day(self):
        run_automatic_reminders(utc(9, 23))
        run_automatic_reminders(utc(10, 23))
        self.assertEqual(len(mail.outbox), 2)

    def test_in_owner_language(self):
        self.user.language = 'ar'
        self.user.save()
        run_automatic_reminders(utc(9, 23))
        self.assertEqual(mail.outbox[0].subject, f'ملخص يومك، {self.shop.name}')
        self.assertIn('تذكير واحد اليوم', mail.outbox[0].body)

    def test_not_sent_when_disabled(self):
        config = get_reminder_settings(self.shop)
        config.daily_summary_enabled = False
        config.save()
        run_automatic_reminders(utc(9, 23))
        self.assertEqual(len(mail.outbox), 0)

    def test_not_sent_below_boutique(self):
        # Résumé du jour : formule Boutique. Le réglage reste, l'envoi est suspendu.
        attach_subscription(self.shop, plan_code=SubscriptionPlan.CODE_SOLO)
        run_automatic_reminders(utc(9, 23))
        self.assertEqual(len(mail.outbox), 0)

    def test_only_the_shop_data(self):
        user_b, shop_b, customer_b = automatic_shop('summary-b@example.com')
        make_order(shop_b, customer_b, days_ago=0)
        Reminder.objects.create(shop=shop_b, title='Rappel B', due_at=utc(10, 1))
        run_automatic_reminders(utc(9, 23))
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn('Rappel B', mail.outbox[0].body)
        self.assertIn('1 commande à préparer', mail.outbox[0].body)
