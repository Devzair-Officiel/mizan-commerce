import io
from dataclasses import replace
from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.core.spreadsheet import spreadsheet_safe
from apps.customers.models import Customer
from apps.invoices.test_pdf import text_pages
from apps.orders.models import Order
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import Subscription, SubscriptionPlan

from . import services
from .throttles import ExportRenderRateThrottle

CSV_HEADER = [
    'N°', 'Date', 'Client', 'Statut', 'Paiement', 'Sous-total', 'Remise',
    'Livraison', 'Total', 'Encaissé', 'Reste dû', 'Trop-perçu',
]


def setup(email: str) -> tuple[User, Shop]:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


def subscribe(shop: Shop, code: str) -> None:
    """Formule active de la boutique (sans souscription : Découverte)."""
    Subscription.objects.update_or_create(shop=shop, defaults={
        'plan': SubscriptionPlan.objects.get(code=code),
        'status': Subscription.STATUS_ACTIVE,
        'current_period_start': timezone.now(),
    })


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=dt_timezone.utc)


class OrdersExportTestCase(TestCase):
    """Boutique Boutique à Paris : deux commandes comptées, une annulée."""

    def setUp(self):
        # Compteurs de la limitation de débit : remis à zéro à chaque test.
        cache.clear()
        self.client = APIClient()
        self.user, self.shop = setup('orders-export@example.com')
        subscribe(self.shop, SubscriptionPlan.CODE_BOUTIQUE)
        Shop.objects.filter(pk=self.shop.pk).update(timezone='Europe/Paris', name='Lin & Co')  # noqa: E501
        self.shop.refresh_from_db()
        self.client.force_authenticate(user=self.user)
        self.customer = Customer.objects.create(shop=self.shop, first_name='Karima', name='Bensouda')  # noqa: E501
        # 21:30 UTC le 30 septembre : 23:30 à Paris, encore en septembre.
        self.first = self._order('A-1', '100.00', paid='40.00', payment='partial', when=utc(2026, 9, 30, 21, 30))  # noqa: E501
        self.walk_in = self._order('A-2', '50.00', paid='50.00', payment='paid', walk_in=True, when=utc(2026, 10, 5, 10, 0))  # noqa: E501
        self.cancelled = self._order('A-3', '30.00', status_='cancelled', when=utc(2026, 10, 6, 10, 0))  # noqa: E501

    def _order(
        self, number: str, total: str, *, when: datetime, paid: str = '0',
        payment: str = 'unpaid', status_: str = 'to_prepare',
        customer: Customer | None = None, walk_in: bool = False,
        shop: Shop | None = None,
    ) -> Order:
        order = Order.objects.create(
            shop=shop or self.shop, order_number=number, created_by=self.user,
            customer=None if walk_in else customer or self.customer,
            status=status_, total_amount=Decimal(total), amount_paid=Decimal(paid),
            payment_status=payment,
        )
        Order.objects.filter(pk=order.pk).update(created_at=when)
        return order

    def url(self, output: str) -> str:
        return reverse('exports-orders', kwargs={'output': output})

    def _csv(self, **params) -> list[list[str]]:
        response = self.client.get(self.url('csv'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response)
        body = b''.join(response.streaming_content)
        return [line.split(';') for line in body.decode('utf-8-sig').splitlines()]

    def _whatsapp(self, **params) -> str:
        response = self.client.get(self.url('whatsapp'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['text']


class OrdersExportRightsTest(OrdersExportTestCase):
    """Formule Boutique, module commandes et isolation entre boutiques."""

    summary_url = reverse('exports-orders-summary')

    def test_free_and_solo_plans_forbidden(self):
        for code in (SubscriptionPlan.CODE_FREE, SubscriptionPlan.CODE_SOLO):
            subscribe(self.shop, code)
            for url in (*(self.url(o) for o in services.FORMATS), self.summary_url):
                with self.subTest(code=code, url=url):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertFalse(AuditLog.objects.filter(action='orders_export').exists())

    def test_boutique_and_commerce_plus_allowed(self):
        for code in (SubscriptionPlan.CODE_BOUTIQUE, SubscriptionPlan.CODE_COMMERCE_PLUS):  # noqa: E501
            subscribe(self.shop, code)
            for url in (*(self.url(o) for o in services.FORMATS), self.summary_url):
                with self.subTest(code=code, url=url):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_orders_module_required(self):
        staff = User.objects.create_user(email='orders-export-staff@example.com', password='Pass123!Strong')  # noqa: E501
        member = ShopMember.objects.create(shop=self.shop, user=staff, role='staff', permissions=['customers'])  # noqa: E501
        self.client.force_authenticate(user=staff)
        self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertEqual(self.client.get(self.summary_url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        member.permissions = ['orders']
        member.save(update_fields=['permissions'])
        self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501

    def test_only_own_shop_orders(self):
        _, shop_b = setup('orders-export-other@example.com')
        subscribe(shop_b, SubscriptionPlan.CODE_BOUTIQUE)
        customer_b = Customer.objects.create(shop=shop_b, name='Client B')
        self._order('B-1', '999.00', customer=customer_b, shop=shop_b, when=utc(2026, 10, 1, 9, 0))  # noqa: E501
        rows = self._csv()
        self.assertEqual([r[0] for r in rows[1:]], ['A-3', 'A-2', 'A-1'])
        self.assertNotIn('B-1', self._whatsapp())
        self.assertEqual(self.client.get(self.summary_url).data['rows'], 3)

    def test_customer_resolved_in_current_shop(self):
        # Client d'une autre boutique : refusé comme un identifiant inconnu,
        # sans aucune donnée de l'une ou l'autre boutique ni ligne d'audit.
        _, shop_b = setup('orders-export-other@example.com')
        customer_b = Customer.objects.create(shop=shop_b, name='Client B')
        self._order('B-1', '999.00', customer=customer_b, shop=shop_b, when=utc(2026, 10, 1, 9, 0))  # noqa: E501
        for url in (*(self.url(o) for o in services.FORMATS), self.summary_url):
            with self.subTest(url=url):
                response = self.client.get(url, {'customer': str(customer_b.pk)})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data['errors']['customer'], ['Client introuvable.'])  # noqa: E501
                body = response.content.decode()
                for leak in ('B-1', 'Client B', 'A-1', 'rows', 'text'):
                    self.assertNotIn(leak, body.replace('"errors"', ''))
        self.assertFalse(AuditLog.objects.filter(action='orders_export').exists())

    def test_unknown_format_not_routed(self):
        response = self.client.get('/api/exports/orders/xlsx/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class OrdersExportCsvTest(OrdersExportTestCase):
    def test_bom_header_rows_and_filename(self):
        response = self.client.get(self.url('csv'))
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertRegex(response['Content-Disposition'], r'attachment; filename="commandes-\d{4}-\d{2}-\d{2}\.csv"')  # noqa: E501
        body = b''.join(response.streaming_content)
        self.assertTrue(body.startswith(b'\xef\xbb\xbf'))
        rows = [line.split(';') for line in body.decode('utf-8-sig').splitlines()]
        self.assertEqual(rows[0], CSV_HEADER)
        # Du plus récent au plus ancien ; heure de Paris ; pas de ligne de totaux.
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[3], ['A-1', '2026-09-30 23:30', 'Karima Bensouda', 'À traiter', 'Partiel', '0,00', '0,00', '0,00', '100,00', '40,00', '60,00', '0,00'])  # noqa: E501
        self.assertEqual(rows[2][2], 'Vente sans client')
        # Annulée : listée avec son statut, sans reste dû ni trop-perçu.
        self.assertEqual((rows[1][3], rows[1][10], rows[1][11]), ('Annulée', '', ''))

    def test_language_of_interface_then_account(self):
        User.objects.filter(pk=self.user.pk).update(language='en')
        self.user.refresh_from_db()
        rows = self._csv()
        self.assertEqual((rows[0][0], rows[3][8], rows[2][2]), ('No.', '100.00', 'Sale without customer'))  # noqa: E501
        rows = self._csv(lang='fr')
        self.assertEqual((rows[0][0], rows[3][8]), ('N°', '100,00'))
        rows = self._csv(lang='ar')
        self.assertEqual((rows[0][0], rows[3][8], rows[2][2]), ('الرقم', '100.00', 'بيع دون عميل'))  # noqa: E501

    def test_spreadsheet_formulas_neutralized(self):
        Customer.objects.filter(pk=self.customer.pk).update(first_name='', name='=1+1')
        rows = self._csv()
        self.assertEqual(rows[3][2], "'=1+1")
        for value, expected in (('@cmd', "'@cmd"), ('-2', "'-2"), ('Lina', 'Lina'), (None, '')):  # noqa: E501
            self.assertEqual(spreadsheet_safe(value), expected)

    def test_status_labels_follow_catalog_and_fulfillment(self):
        Order.objects.filter(pk=self.first.pk).update(status='shipped')
        Shop.objects.filter(pk=self.shop.pk).update(catalog_kind='products', fulfillment_mode='delivery')  # noqa: E501
        rows = self._csv()
        self.assertEqual((rows[3][3], rows[2][3]), ('Expédiée', 'À préparer'))
        Shop.objects.filter(pk=self.shop.pk).update(catalog_kind='services')
        rows = self._csv()
        self.assertEqual((rows[3][3], rows[2][3]), ('Réalisée', 'Confirmée'))


class OrdersExportFiltersTest(OrdersExportTestCase):
    summary_url = reverse('exports-orders-summary')

    def _numbers(self, **params) -> list[str]:
        return [r[0] for r in self._csv(**params)[1:]]

    def test_period_on_creation_date_in_shop_timezone(self):
        # Le 30 septembre à 23:30 (Paris) est le 1er octobre en UTC+2 mais pas ici.
        self.assertEqual(self._numbers(**{'from': '2026-10-01'}), ['A-3', 'A-2'])
        self.assertEqual(self._numbers(**{'to': '2026-09-30'}), ['A-1'])
        self.assertEqual(self._numbers(**{'from': '2026-10-05', 'to': '2026-10-05'}), ['A-2'])  # noqa: E501

    def test_page_filters_search_and_ordering(self):
        self.assertEqual(self._numbers(status='cancelled'), ['A-3'])
        self.assertEqual(self._numbers(payment_status='paid'), ['A-2'])
        self.assertEqual(self._numbers(due='true'), ['A-1'])
        self.assertEqual(self._numbers(customer=str(self.customer.pk)), ['A-3', 'A-1'])
        self.assertEqual(self._numbers(search='karima'), ['A-3', 'A-1'])
        self.assertEqual(self._numbers(ordering='total_amount'), ['A-3', 'A-2', 'A-1'])
        self.assertEqual(self._numbers(ordering='-total_amount'), ['A-1', 'A-2', 'A-3'])

    def test_ordering_whitelisted(self):
        # Hors des champs de tri de la liste : ignoré, récentes d'abord.
        default = ['A-3', 'A-2', 'A-1']
        for ordering in ('amount_paid', 'shop__name', 'customer__phone', 'created_by__password'):  # noqa: E501
            with self.subTest(ordering=ordering):
                self.assertEqual(self._numbers(ordering=ordering), default)
                self.assertEqual(self._numbers(ordering=f'-{ordering}'), default)
        by_name = self._numbers(ordering='customer__name')
        self.assertEqual(by_name, ['A-3', 'A-1', 'A-2'])

    def test_lang_whitelisted(self):
        for lang in ('de', 'fr-FR', 'FR', '../ar'):
            with self.subTest(lang=lang):
                response = self.client.get(self.url('csv'), {'lang': lang})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('lang', response.data['errors'])
        for lang, header in (('fr', 'N°'), ('en', 'No.'), ('ar', 'الرقم')):
            self.assertEqual(self._csv(lang=lang)[0][0], header)
        # Vide : comme absent, langue du compte.
        self.assertEqual(self._csv(lang='')[0][0], 'N°')

    def test_summary_counts_rows_and_cap(self):
        data = self.client.get(self.summary_url, {'from': '2026-10-01'}).data
        self.assertEqual(data, {'rows': 2, 'pdf_max_rows': 1000, 'whatsapp_max_rows': 15})  # noqa: E501
        data = self.client.get(self.summary_url, {'search': 'A-2'}).data
        self.assertEqual(data['rows'], 1)
        self.assertFalse(AuditLog.objects.filter(action='orders_export').exists())

    def test_invalid_params_rejected(self):
        for params in (
            {'from': '2026-10-02', 'to': '2026-10-01'}, {'from': 'hier'},
            {'status': 'bogus'}, {'payment_status': 'bogus'}, {'customer': 'x'},
            {'lang': 'de'}, {'search': 'x' * 101},
        ):
            for url in (self.url('pdf'), self.summary_url):
                with self.subTest(params=params, url=url):
                    self.assertEqual(self.client.get(url, params).status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
        self.assertFalse(AuditLog.objects.filter(action='orders_export').exists())

    def test_audit_log(self):
        self._csv(**{'from': '2026-10-01', 'status': 'cancelled', 'search': 'Karima'})
        self.client.get(self.url('whatsapp'), {'due': 'true', 'customer': str(self.customer.pk)})  # noqa: E501
        logs = AuditLog.objects.filter(action='orders_export').order_by('created_at')
        self.assertEqual(len(logs), 2)
        log = logs[0]
        self.assertEqual(
            (log.shop_id, log.user, log.model_name, log.object_id, log.object_repr),
            (self.shop.id, self.user, 'Shop', str(self.shop.id), 'Lin & Co'),
        )
        # La recherche n'est consignée que par sa présence (données personnelles).
        self.assertEqual(log.changes, {
            'format': 'csv', 'rows': 1, 'from': '2026-10-01', 'to': None,
            'status': 'cancelled', 'payment_status': None, 'due': False,
            'customer': None, 'search': True,
        })
        self.assertEqual(
            {k: logs[1].changes[k] for k in ('format', 'rows', 'due', 'customer', 'search')},  # noqa: E501
            {'format': 'whatsapp', 'rows': 1, 'due': True, 'customer': str(self.customer.pk), 'search': False},  # noqa: E501
        )


class OrdersExportWhatsappTest(OrdersExportTestCase):
    def test_title_period_totals_and_rows(self):
        response = self.client.get(self.url('whatsapp'), {'from': '2026-09-01', 'to': '2026-10-31'})  # noqa: E501
        self.assertEqual(response.data['rows'], 3)
        self.assertNotIn('Content-Disposition', response)
        lines = response.data['text'].split('\n')
        self.assertEqual(lines[:2], ['*Commandes · Lin & Co*', 'Créées du 1 sept. 2026 au 31 oct. 2026'])  # noqa: E501
        text = response.data['text']
        # Totaux hors annulées : 2 commandes, 150 €, 90 € encaissés, 60 € dus.
        for line in ('_Hors commandes annulées_', '- Commandes : 2', '- Total : 150,00 €', '- Encaissé : 90,00 €', '- Reste dû : 60,00 €'):  # noqa: E501
            self.assertIn(line, text)
        self.assertIn('- *A-2* · 5 oct. 2026 · Vente sans client · 50,00 € · Payée', lines)  # noqa: E501
        # L'annulée donne son statut à la place du paiement.
        self.assertIn('- *A-3* · 6 oct. 2026 · Karima Bensouda · 30,00 € · Annulée', lines)  # noqa: E501
        self.assertNotIn('autres', text)

    def test_fifteen_rows_then_remainder(self):
        for i in range(14):
            self._order(f'B-{i:02}', '10.00', when=utc(2026, 8, 1, 9, i))
        text = self._whatsapp()
        detail = [line for line in text.split('\n') if line.startswith('- *')]
        self.assertEqual(len(detail), services.WHATSAPP_MAX_ROWS)
        self.assertTrue(text.endswith('… et 2 autres commandes (liste complète en PDF ou CSV)'))  # noqa: E501
        self.assertNotIn('joint', text)
        self.assertTrue(self._whatsapp(lang='en').endswith('… and 2 more orders (full list in the PDF or CSV)'))  # noqa: E501
        self.assertTrue(self._whatsapp(lang='ar').endswith('… والطلبات المتبقية: 2 (القائمة الكاملة في ملف PDF أو CSV)'))  # noqa: E501
        Order.objects.filter(order_number='B-00').delete()
        self.assertTrue(self._whatsapp().endswith('… et 1 autre commande (liste complète en PDF ou CSV)'))  # noqa: E501

    def test_filters_line_and_formatting_marks_removed(self):
        Customer.objects.filter(pk=self.customer.pk).update(first_name='*Karima*', name='_B_')  # noqa: E501
        text = self._whatsapp(status='to_prepare', due='true', lang='en')
        self.assertIn('Filters: To process · Outstanding', text)
        self.assertIn('- *A-1* · 30 Sep 2026 · Karima B · €100.00 · Partial', text)
        self.assertIn('All creation dates', text)

    def test_arabic_message(self):
        text = self._whatsapp(lang='ar')
        self.assertTrue(text.startswith('*الطلبات · Lin & Co*'))
        self.assertIn('بيع دون عميل', text)


class OrdersExportPdfTest(OrdersExportTestCase):
    def _pdf(self, **params) -> str:
        response = self.client.get(self.url('pdf'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))  # noqa: E501
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertRegex(response['Content-Disposition'], r'filename="(commandes|orders)-\d{4}-\d{2}-\d{2}\.pdf"')  # noqa: E501
        return '\n'.join(text_pages(response.content))

    def test_header_period_totals_rows_and_pages(self):
        text = self._pdf(**{'from': '2026-09-01', 'to': '2026-10-31'})
        for expected in (
            'Lin & Co', 'Commandes', 'Créées du 1 sept. 2026 au 31 oct. 2026',
            'Généré le', 'Hors commandes annulées', '150,00', '90,00', '60,00',
            'Vente sans client', 'Karima Bensouda', '30/09/2026', 'Annulée',
            'Page 1 sur 1',
        ):
            self.assertIn(expected, text)

    def test_arabic_falls_back_to_french_english_kept(self):
        self.assertIn('Commandes', self._pdf(lang='ar'))
        text = self._pdf(lang='en')
        self.assertIn('All creation dates', text)
        self.assertIn('Page 1 of 1', text)
        log = AuditLog.objects.filter(action='orders_export').first()
        self.assertEqual(log.changes['format'], 'pdf')

    def test_empty_selection(self):
        text = self._pdf(status='prepared')
        self.assertIn('Aucune commande ne correspond à ces critères.', text)

    def test_many_rows_span_pages(self):
        for i in range(60):
            self._order(f'C-{i:02}', '10.00', when=utc(2026, 8, 1, 9, i))
        self.assertIn('Page 2 sur 2', self._pdf())

    def test_row_cap_proposes_csv(self):
        with mock.patch.object(services, 'PDF_MAX_ROWS', 2):
            response = self.client.get(self.url('pdf'))
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual((response.data['code'], response.data['max_rows']), ('pdf_row_limit', 2))  # noqa: E501
            # Le CSV et le message ne sont pas plafonnés ; refus non journalisé.
            self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_200_OK)  # noqa: E501
            self.assertEqual(self.client.get(self.url('whatsapp')).status_code, status.HTTP_200_OK)  # noqa: E501
            self.assertEqual(self._pdf(**{'from': '2026-10-01'}).count('A-'), 2)
        formats = list(AuditLog.objects.filter(action='orders_export').values_list('changes__format', flat=True))  # noqa: E501
        self.assertEqual(sorted(formats), ['csv', 'pdf', 'whatsapp'])

    def test_cap_is_one_thousand_rows(self):
        dataset = services.orders_dataset(
            self.shop, Order.objects.none(), services.OrderFilters(), 'fr',
        )
        services.check_row_limit(replace(dataset, row_count=1000), 'pdf')
        services.check_row_limit(replace(dataset, row_count=50_000), 'csv')
        with self.assertRaises(services.TooManyRows):
            services.check_row_limit(replace(dataset, row_count=1001), 'pdf')


class OrdersExportOverpaymentTest(OrdersExportTestCase):
    """Trop-perçu : jamais déduit du reste dû, total à part s'il y en a."""

    def setUp(self):
        super().setUp()
        self._order('A-4', '20.00', paid='25.00', payment='paid', when=utc(2026, 10, 7, 10, 0))  # noqa: E501

    def test_csv_row_floors_due_and_shows_overpaid(self):
        row = self._csv()[1]
        self.assertEqual((row[0], row[8], row[9], row[10], row[11]), ('A-4', '20,00', '25,00', '0,00', '5,00'))  # noqa: E501

    def test_totals_keep_due_and_add_overpaid(self):
        text = self._whatsapp()
        # Reste dû de A-1 seul (60 €) : les 5 € de trop sur A-4 ne s'en déduisent pas.
        for line in ('- Commandes : 3', '- Encaissé : 115,00\u00a0€', '- Reste dû : 60,00\u00a0€', '- Trop-perçu : 5,00\u00a0€'):  # noqa: E501
            self.assertIn(line, text)
        pdf = '\n'.join(text_pages(self.client.get(self.url('pdf')).content))
        self.assertIn('TROP-PERÇU', pdf)
        self.assertIn('5,00', pdf)

    def test_overpaid_total_hidden_when_none(self):
        Order.objects.filter(order_number='A-4').update(amount_paid=Decimal('20.00'))
        self.assertNotIn('Trop-perçu', self._whatsapp())
        pdf = '\n'.join(text_pages(self.client.get(self.url('pdf')).content))
        self.assertNotIn('TROP-PERÇU', pdf)
        # La colonne du CSV reste, à zéro.
        self.assertEqual(self._csv()[1][11], '0,00')

    def test_cancelled_overpayment_ignored(self):
        Order.objects.filter(order_number='A-4').update(status='cancelled')
        self.assertNotIn('Trop-perçu', self._whatsapp())


class OrdersExportSeedOverpaymentTest(TestCase):
    """Commande 2026-011 de la démo : 64,88 € encaissés 80,00 €.

    Reste dû 0,00, trop-perçu 15,12.
    """

    @classmethod
    def setUpTestData(cls):
        with override_settings(DEBUG=True):
            call_command(
                'seed_data', reset=True, stdout=io.StringIO(), stderr=io.StringIO(),
            )
        cls.shop = Shop.objects.get(name='La Boutique de Youssef')
        subscribe(cls.shop, SubscriptionPlan.CODE_BOUTIQUE)
        cls.owner = ShopMember.objects.get(shop=cls.shop, role='owner').user

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.query = {'search': '2026-011', 'lang': 'fr'}

    def get(self, output: str):
        response = self.client.get(reverse('exports-orders', kwargs={'output': output}), self.query)  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response

    def test_csv_due_zero_and_overpaid_column(self):
        body = b''.join(self.get('csv').streaming_content).decode('utf-8-sig')
        header, row = (line.split(';') for line in body.splitlines())
        self.assertEqual(header[10:], ['Reste dû', 'Trop-perçu'])
        self.assertEqual((row[0], row[8], row[9], row[10], row[11]), ('2026-011', '64,88', '80,00', '0,00', '15,12'))  # noqa: E501

    def test_message_and_pdf_totals(self):
        text = self.get('whatsapp').data['text']
        self.assertIn('- Reste dû : 0,00\u00a0€', text)
        self.assertIn('- Trop-perçu : 15,12\u00a0€', text)
        pdf = '\n'.join(text_pages(self.get('pdf').content))
        self.assertIn('TROP-PERÇU', pdf)
        self.assertIn('15,12', pdf)


class OrdersExportThrottleTest(OrdersExportTestCase):
    """PDF et message : 10 par minute et par utilisateur ; le CSV n'est pas limité."""

    # Débit par défaut, quelle que soit la pile locale (EXPORTS_RENDER_RATE).
    @mock.patch.object(ExportRenderRateThrottle, 'THROTTLE_RATES', {'exports_render': '10/minute'})  # noqa: E501
    def test_pdf_and_whatsapp_limited_per_user(self):
        for i in range(10):
            output = ('pdf', 'whatsapp')[i % 2]
            self.assertEqual(self.client.get(self.url(output)).status_code, status.HTTP_200_OK)  # noqa: E501
        for output in ('pdf', 'whatsapp'):
            response = self.client.get(self.url(output))
            self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_200_OK)  # noqa: E501
        self.assertEqual(self.client.get(reverse('exports-orders-summary')).status_code, status.HTTP_200_OK)  # noqa: E501
        # Refus non journalisés : 10 rendus + 1 CSV.
        self.assertEqual(AuditLog.objects.filter(action='orders_export').count(), 11)
        # Un autre utilisateur garde son quota.
        other, _ = setup('orders-export-second@example.com')
        ShopMember.objects.filter(user=other).update(shop=self.shop)
        self.client.force_authenticate(user=other)
        self.assertEqual(self.client.get(self.url('pdf')).status_code, status.HTTP_200_OK)  # noqa: E501
