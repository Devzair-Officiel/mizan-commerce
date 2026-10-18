"""Rappel du jour J par e-mail (Z2b) : fenêtre J-7 à J-1, calendriers, 29 février,
un seul envoi par année de hawl (update conditionnel dans la transaction de l'envoi),
droits, réglage, aucun montant."""
import threading
import time
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal
from smtplib import SMTPException
from unittest import mock

from django.core import mail
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings

from apps.accounts.models import User
from apps.notes.models import Reminder
from apps.shops.models import Shop, ShopMember
from . import services
from .models import ZakatCalculation, ZakatProfile
from .tasks import send_zakat_reminders
from .test_pdf import USURY

# 1 ramadan 1446 : 1 ramadan 1447 tombe le 18 février 2026, le 1 mars en grégorien.
HAWL_DATE = date(2025, 3, 1)
HIJRI_DAY = date(2026, 2, 18)
GREGORIAN_DAY = date(2026, 3, 1)


def _at(day: date) -> datetime:
    """6 h UTC, heure de la tâche (`zakat-reminders-daily`)."""
    return datetime(day.year, day.month, day.day, 6, tzinfo=dt_timezone.utc)


def _member(shop: Shop, email: str, role: str, **profile) -> ZakatProfile:
    user = User.objects.create_user(
        email=email, password='Pass123!Strong', full_name='Salma Idrissi',
    )
    ShopMember.objects.create(shop=shop, user=user, role=role)
    return ZakatProfile.objects.create(
        shop=shop, user=user, hawl_date=HAWL_DATE, calendar='hijri', **profile,
    )


@override_settings(FRONTEND_URL='https://app.example.com')
class HawlReminderTest(TestCase):
    def setUp(self):
        self.shop = Shop.objects.create(name='Épicerie Salma', currency='EUR')
        self.profile = _member(self.shop, 'owner@example.com', 'owner')

    def _run(self, day: date) -> int:
        return services.send_hawl_reminders(_at(day))

    def test_hijri_calendar_follows_the_lunar_year(self):
        # 7 jours avant l'anniversaire grégorien : rien, le jour J est passé.
        self.assertEqual(self._run(GREGORIAN_DAY - timedelta(days=7)), 0)
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=8)), 0)
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['owner@example.com'])
        self.assertEqual(
            email.subject,
            'Votre jour J de zakat approche : 18 février 2026 (1 ramadan 1447)',
        )
        self.assertIn('Bonjour Salma Idrissi,', email.body)
        self.assertIn('Votre jour J de zakat tombe le 18 février 2026 (1 ramadan 1447).', email.body)  # noqa: E501
        self.assertIn('https://app.example.com/zakat\n', email.body)
        self.assertIn('https://app.example.com/zakat/reglages', email.body)
        self.profile.refresh_from_db()
        self.assertEqual(
            (self.profile.reminder_sent_calendar, self.profile.reminder_sent_year),
            ('hijri', 1447),
        )

    def test_gregorian_calendar(self):
        self.profile.calendar = 'gregorian'
        self.profile.save(update_fields=['calendar'])
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 0)
        self.assertEqual(self._run(GREGORIAN_DAY - timedelta(days=7)), 1)
        self.assertIn('1 mars 2026', mail.outbox[0].subject)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.reminder_sent_year, 2026)

    def test_february_29_falls_on_the_28th(self):
        self.profile.hawl_date = date(2024, 2, 29)
        self.profile.calendar = 'gregorian'
        self.profile.save(update_fields=['hawl_date', 'calendar'])
        self.assertEqual(self._run(date(2026, 2, 21)), 1)
        self.assertIn('28 février 2026', mail.outbox[0].subject)

    def test_once_per_hawl_year_from_d7_to_d1(self):
        self.assertEqual(self.profile.reminder_sent_year, None)
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 1)
        for days in (7, 6, 1):
            self.assertEqual(self._run(HIJRI_DAY - timedelta(days=days)), 0)
        # Le jour J lui-même n'est pas dans la fenêtre.
        self.assertEqual(self._run(HIJRI_DAY), 0)
        self.assertEqual(len(mail.outbox), 1)
        # L'année suivante (1448) repart.
        next_day = services.hawl.next_hawl_date(HAWL_DATE, 'hijri', HIJRI_DAY + timedelta(days=1))  # noqa: E501
        self.assertEqual(self._run(next_day - timedelta(days=3)), 1)

    def test_late_setup_still_reminded_before_the_day(self):
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=1)), 1)

    def test_smtp_failure_rolls_back_and_retries_next_day(self):
        failing = mock.patch.object(services, 'send_mail', side_effect=SMTPException('down'))  # noqa: E501
        with failing, self.assertLogs('apps.zakat.services', 'ERROR') as logs:
            self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 0)
        self.assertIn(str(self.profile.pk), logs.output[0])
        self.profile.refresh_from_db()
        self.assertIsNone(self.profile.reminder_sent_calendar)
        self.assertIsNone(self.profile.reminder_sent_year)
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=6)), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_setting_disabled(self):
        self.profile.reminder_email_enabled = False
        self.profile.save(update_fields=['reminder_email_enabled'])
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_only_admins_are_reminded(self):
        _member(self.shop, 'admin@example.com', 'admin')
        _member(self.shop, 'staff@example.com', 'staff')
        inactive = _member(self.shop, 'gone@example.com', 'admin')
        User.objects.filter(pk=inactive.user_id).update(is_active=False)
        self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 2)
        self.assertEqual(
            sorted(email.to[0] for email in mail.outbox),
            ['admin@example.com', 'owner@example.com'],
        )

    def test_shop_without_zakat_feature(self):
        with mock.patch.object(services, 'shop_has_feature', return_value=False):
            self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_no_amount_in_any_language(self):
        ZakatCalculation.objects.create(
            shop=self.shop, user=self.profile.user, reference_date='2025-03-01',
            hawl_calendar='hijri', hawl_year=1446, currency='EUR',
            cash_amount=Decimal('6543.21'), stock_sale_value=Decimal('5000.00'),
            choices_snapshot={'calendar': 'hijri', 'nisab_method': 'gold', 'nisab_unit_price': '50.00'},  # noqa: E501
        )
        user = self.profile.user
        for index, language in enumerate(('fr', 'en', 'ar')):
            user.language = language
            user.save(update_fields=['language'])
            ZakatProfile.objects.filter(pk=self.profile.pk).update(reminder_sent_year=None)
            self.assertEqual(self._run(HIJRI_DAY - timedelta(days=7)), 1)
            email = mail.outbox[index]
            for text in (email.subject, email.body):
                for amount in ('€', 'EUR', '6543', '6 543', '6,543', '5000', '4250'):
                    self.assertNotIn(amount, text, language)
                self.assertIsNone(USURY.search(text), language)
        self.assertEqual(
            mail.outbox[1].subject,
            'Your zakat day is coming up: February 18, 2026 (1 Ramadan 1447)',
        )
        self.assertEqual(
            mail.outbox[2].subject, 'يقترب يوم حساب زكاتك: 18 فبراير 2026 (1 رمضان 1447)',  # noqa: E501
        )

    def test_task_sends_email_and_creates_no_reminder(self):
        with mock.patch.object(services.timezone, 'now', return_value=_at(HIJRI_DAY - timedelta(days=7))):  # noqa: E501
            self.assertEqual(send_zakat_reminders(), {'reminder_emails_sent': 1})
        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(Reminder.objects.exists())


class HawlReminderConcurrencyTest(TransactionTestCase):
    """Deux tâches simultanées : un seul e-mail. L'envoi est ralenti pour que la
    seconde réservation arrive pendant que la première tient le verrou de la ligne."""

    serialized_rollback = True

    def test_two_tasks_send_one_email(self):
        shop = Shop.objects.create(name='Course', currency='EUR')
        profile = _member(shop, 'race@example.com', 'owner')
        today = HIJRI_DAY - timedelta(days=7)
        barrier = threading.Barrier(2)
        sent: list[str] = []
        results: list[bool | BaseException] = []

        def slow_send(subject, body, sender, recipients) -> int:
            time.sleep(0.3)
            sent.extend(recipients)
            return 1

        def worker() -> None:
            try:
                barrier.wait()
                results.append(services.send_hawl_reminder(ZakatProfile.objects.select_related('user').get(pk=profile.pk), today))  # noqa: E501
            except BaseException as exc:  # noqa: BLE001 — on compare les issues.
                results.append(exc)
            finally:
                connection.close()

        with mock.patch.object(services, 'send_mail', slow_send):
            threads = [threading.Thread(target=worker) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
        self.assertEqual(sorted(results, key=str), [False, True])
        self.assertEqual(sent, ['race@example.com'])
