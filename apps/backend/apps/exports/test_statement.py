import uuid
from unittest import mock
from zoneinfo import ZoneInfo

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.customers.models import Customer
from apps.invoices.test_pdf import text_pages
from apps.notes.models import Note
from apps.orders.models import Order
from apps.shops.models import ShopMember
from apps.subscriptions.models import SubscriptionPlan

from . import services
from .tests import OrdersExportTestCase, setup, subscribe, utc
from .throttles import ExportRenderRateThrottle

OUTPUTS = ('pdf', 'whatsapp')


class StatementTestCase(OrdersExportTestCase):
    """Relevé de Karima Bensouda (Lin & Co, Paris) : A-1 partielle, A-3 annulée,
    et une note ; la vente sans client A-2 et la commande A-5 d'un autre client
    n'y figurent jamais."""

    def setUp(self):
        super().setUp()
        Customer.objects.filter(pk=self.customer.pk).update(
            phone='+33612345678', email='karima@example.com', city='Lyon', postal_code='69001',  # noqa: E501
        )
        self.customer.refresh_from_db()
        other = Customer.objects.create(shop=self.shop, name='Autre client')
        self._order('A-5', '70.00', customer=other, when=utc(2026, 10, 8, 10, 0))
        Note.objects.create(shop=self.shop, customer=self.customer, order=self.first, author=self.user, content='Note confidentielle')  # noqa: E501

    def url(self, output: str, customer: Customer | None = None) -> str:
        pk = (customer or self.customer).pk
        if output == 'summary':
            return reverse('exports-statement-summary', kwargs={'pk': pk})
        return reverse('exports-statement', kwargs={'pk': str(pk), 'output': output})

    def urls(self, customer: Customer | None = None) -> tuple[str, ...]:
        return tuple(self.url(o, customer) for o in (*OUTPUTS, 'summary'))

    def today(self) -> str:
        return timezone.now().astimezone(ZoneInfo('Europe/Paris')).strftime('%d/%m/%Y')

    def _whatsapp(self, **params) -> str:
        response = self.client.get(self.url('whatsapp'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['text']

    def _pdf(self, **params) -> str:
        response = self.client.get(self.url('pdf'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))  # noqa: E501
        self.assertEqual(response['Content-Type'], 'application/pdf')
        return '\n'.join(text_pages(response.content))

    def logs(self):
        return AuditLog.objects.filter(action='customer_activity_export')


class StatementRightsTest(StatementTestCase):
    """Formule Boutique, module Clients (pas Commandes), isolation entre boutiques."""

    def test_free_and_solo_plans_forbidden(self):
        for code in (SubscriptionPlan.CODE_FREE, SubscriptionPlan.CODE_SOLO):
            subscribe(self.shop, code)
            for url in self.urls():
                with self.subTest(code=code, url=url):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertFalse(self.logs().exists())

    def test_boutique_and_commerce_plus_allowed(self):
        for code in (SubscriptionPlan.CODE_BOUTIQUE, SubscriptionPlan.CODE_COMMERCE_PLUS):  # noqa: E501
            subscribe(self.shop, code)
            for url in self.urls():
                with self.subTest(code=code, url=url):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_customers_module_without_orders_module(self):
        staff = User.objects.create_user(email='statement-staff@example.com', password='Pass123!Strong')  # noqa: E501
        member = ShopMember.objects.create(shop=self.shop, user=staff, role='staff', permissions=['customers'])  # noqa: E501
        self.client.force_authenticate(user=staff)
        for url in self.urls():
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        # Le module Commandes seul ne suffit pas.
        member.permissions = ['orders']
        member.save(update_fields=['permissions'])
        for url in self.urls():
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501

    def test_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url('pdf')).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501

    def test_customer_of_another_shop_refused(self):
        # Même réponse que l'export des commandes : 400 « Client introuvable. »,
        # sans donnée de l'une ou l'autre boutique ni ligne d'audit.
        _, shop_b = setup('statement-other@example.com')
        customer_b = Customer.objects.create(shop=shop_b, name='Client B')
        self._order('B-1', '999.00', customer=customer_b, shop=shop_b, when=utc(2026, 10, 1, 9, 0))  # noqa: E501
        unknown = Customer(pk=uuid.uuid4(), shop=shop_b, name='?')
        for customer in (customer_b, unknown):
            for url in self.urls(customer):
                with self.subTest(url=url):
                    response = self.client.get(url)
                    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
                    self.assertEqual(response.data['errors']['customer'], ['Client introuvable.'])  # noqa: E501
                    body = response.content.decode()
                    for leak in ('B-1', 'Client B', 'A-1', 'rows', 'text'):
                        self.assertNotIn(leak, body.replace('"errors"', ''))
        self.assertFalse(self.logs().exists())

    def test_only_own_shop_orders(self):
        _, shop_b = setup('statement-other@example.com')
        self._order('B-1', '999.00', shop=shop_b, walk_in=True, when=utc(2026, 10, 1, 9, 0))  # noqa: E501
        self.assertNotIn('B-1', self._pdf())
        self.assertEqual(self.client.get(self.url('summary')).data['rows'], 2)

    def test_unknown_format_not_routed(self):
        for output in ('csv', 'xlsx'):
            response = self.client.get(f'/api/exports/customers/{self.customer.pk}/statement/{output}/')  # noqa: E501
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class StatementTotalsTest(StatementTestCase):
    """Le relevé est l'export des commandes filtré sur le client."""

    def assertSameTotals(self, **filters) -> None:
        statement_filters = services.OrderFilters(customer=self.customer, **filters)
        orders = services.orders_dataset(
            self.shop, services.export_orders_queryset(self.shop, statement_filters),
            statement_filters, 'fr',
        )
        statement = services.statement_dataset(
            self.shop, services.statement_queryset(self.shop, statement_filters),
            statement_filters, 'fr',
        )
        self.assertEqual(statement.totals, orders.totals)
        self.assertEqual(statement.row_count, orders.row_count)

    def test_totals_match_orders_export_of_the_customer(self):
        self._order('A-6', '20.00', paid='25.00', payment='paid', when=utc(2026, 10, 9, 10, 0))  # noqa: E501
        self.assertSameTotals()
        self.assertSameTotals(due=True)
        self.assertSameTotals(date_from=utc(2026, 10, 1).date())
        # Annulée exclue : A-1 et A-6, 120 € commandés, 65 € encaissés, 60 € dus, 5 € de trop.  # noqa: E501
        totals = {t.key: t.value for t in services.statement_dataset(
            self.shop, services.statement_queryset(self.shop, services.OrderFilters(customer=self.customer)),  # noqa: E501
            services.OrderFilters(customer=self.customer), 'fr',
        ).totals}
        self.assertEqual(totals, {'count': 2, 'total': 120, 'paid': 65, 'due': 60, 'overpaid': 5})  # noqa: E501

    def test_period_on_creation_date_and_summary(self):
        # 30 septembre 23:30 à Paris : hors d'octobre ; l'annulée reste listée.
        self.assertEqual(self.client.get(self.url('summary'), {'from': '2026-10-01'}).data, {  # noqa: E501
            'rows': 1, 'pdf_max_rows': services.PDF_MAX_ROWS,
            'whatsapp_max_rows': services.WHATSAPP_MAX_ROWS,
        })
        self.assertEqual(self.client.get(self.url('summary'), {'due': 'true'}).data['rows'], 1)  # noqa: E501
        for params in ({'from': '2026-10-02', 'to': '2026-10-01'}, {'from': 'hier'}, {'lang': 'de'}, {'due': 'peut-être'}):  # noqa: E501
            self.assertEqual(self.client.get(self.url('pdf'), params).status_code, status.HTTP_400_BAD_REQUEST, params)  # noqa: E501


class StatementPdfTest(StatementTestCase):
    def test_header_identity_situation_and_rows(self):
        response = self.client.get(self.url('pdf'), {'from': '2026-09-01', 'to': '2026-10-31'})  # noqa: E501
        self.assertRegex(response['Content-Disposition'], r'filename="releve-karima-bensouda-\d{4}-\d{2}-\d{2}\.pdf"')  # noqa: E501
        text = '\n'.join(text_pages(response.content))
        for expected in (
            'Lin & Co', 'Relevé de compte', 'Karima Bensouda', '+33 6 12 34 56 78',
            'karima@example.com', '69001 Lyon', 'Créées du 1 sept. 2026 au 31 oct. 2026',  # noqa: E501
            f'Situation au {self.today()}', 'Hors commandes annulées',
            'A-1', '30/09/2026', 'Partiel', '100,00', '40,00', '60,00', 'A-3', 'Annulée',  # noqa: E501
            'Reste dû', 'Page 1 sur 1',
        ):
            self.assertIn(expected, text)
        # Ni vente sans client, ni autre client, ni colonne Client, ni note.
        for absent in ('A-2', 'A-5', 'Vente sans client', 'Autre client', 'Client', 'Note confidentielle', 'TROP-PERÇU'):  # noqa: E501
            self.assertNotIn(absent, text)

    def test_newest_first(self):
        text = self._pdf()
        self.assertLess(text.index('A-3'), text.index('A-1'))

    def test_overpaid_total(self):
        self._order('A-6', '20.00', paid='25.00', payment='paid', when=utc(2026, 10, 9, 10, 0))  # noqa: E501
        text = self._pdf()
        self.assertIn('TROP-PERÇU', text)
        self.assertIn('5,00', text)

    def test_customer_without_contact_details(self):
        Customer.objects.filter(pk=self.customer.pk).update(phone='', email='', city='', postal_code='')  # noqa: E501
        text = self._pdf()
        self.assertIn('Karima Bensouda', text)
        self.assertNotIn('+33', text)

    def test_empty_period(self):
        self.assertIn('Aucune commande sur cette période.', self._pdf(**{'from': '2026-10-10'}))  # noqa: E501

    def test_arabic_in_french_english_kept(self):
        self.assertIn('Relevé de compte', self._pdf(lang='ar'))
        text = self._pdf(lang='en')
        self.assertIn('Account statement', text)
        self.assertIn(f'Balance as of {self.today()}', text)

    def test_row_cap_proposes_csv(self):
        with mock.patch.object(services, 'PDF_MAX_ROWS', 1):
            response = self.client.get(self.url('pdf'))
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual((response.data['code'], response.data['max_rows']), ('pdf_row_limit', 1))  # noqa: E501
            self.assertEqual(self.client.get(self.url('whatsapp')).status_code, status.HTTP_200_OK)  # noqa: E501
        # Refus non journalisé.
        self.assertEqual(list(self.logs().values_list('changes__format', flat=True)), ['whatsapp'])  # noqa: E501

    def test_audit_log(self):
        self._pdf(**{'from': '2026-09-01', 'due': 'true'})
        log = self.logs().get()
        self.assertEqual((log.shop_id, log.user, log.model_name, log.object_id), (self.shop.id, self.user, 'Customer', str(self.customer.pk)))  # noqa: E501
        self.assertEqual(log.changes, {'format': 'pdf', 'pending': True, 'rows': 1, 'from': '2026-09-01', 'to': None})  # noqa: E501


class StatementWhatsappTest(StatementTestCase):
    def test_header_totals_and_orders_to_settle(self):
        self._order('A-6', '20.00', paid='20.00', payment='paid', when=utc(2026, 10, 9, 10, 0))  # noqa: E501
        response = self.client.get(self.url('whatsapp'))
        self.assertNotIn('Content-Disposition', response)
        text = response.data['text']
        lines = text.split('\n')
        self.assertEqual(lines[:4], [
            '*Relevé de compte · Lin & Co*', 'Karima Bensouda',
            'Toutes les dates de création', f'Situation au {self.today()}',
        ])
        self.assertIn('Filtres : À encaisser', text)
        self.assertIn('- Reste dû : 60,00 €', text)
        # Seulement ce qui reste à régler : ni la payée A-6, ni l'annulée A-3.
        detail = [line for line in lines if line.startswith('- *')]
        self.assertEqual(detail, ['- *A-1* · 30 sept. 2026 · 100,00 € · reste dû 60,00 €'])  # noqa: E501
        self.assertEqual(response.data['rows'], 1)
        # Ni coordonnées, ni note, ni autre client.
        for absent in ('+33', 'karima@example.com', 'Note confidentielle', 'A-5', 'A-2'):  # noqa: E501
            self.assertNotIn(absent, text)

    def test_fifteen_newest_then_remainder(self):
        for i in range(16):
            self._order(f'B-{i:02}', '10.00', when=utc(2026, 8, 1, 9, i))
        text = self._whatsapp()
        detail = [line for line in text.split('\n') if line.startswith('- *')]
        self.assertEqual(len(detail), services.WHATSAPP_MAX_ROWS)
        # A-1 (30 septembre) d'abord, puis les plus récentes du 1er août.
        self.assertEqual([line.split('*')[1] for line in detail[:3]], ['A-1', 'B-15', 'B-14'])  # noqa: E501
        self.assertTrue(text.endswith('… et 2 autres commandes (liste complète en PDF ou CSV)'))  # noqa: E501
        self.assertTrue(self._whatsapp(lang='ar').endswith('… والطلبات المتبقية: 2 (القائمة الكاملة في ملف PDF أو CSV)'))  # noqa: E501
        Order.objects.filter(order_number='B-00').delete()
        self.assertTrue(self._whatsapp(lang='en').endswith('… and 1 more order (full list in the PDF or CSV)'))  # noqa: E501

    def test_nothing_to_settle(self):
        Order.objects.filter(pk=self.first.pk).update(amount_paid=100, payment_status='paid')  # noqa: E501
        text = self._whatsapp()
        self.assertTrue(text.endswith('\n\nAucune commande à régler sur cette période.'))  # noqa: E501

    def test_customer_without_phone(self):
        Customer.objects.filter(pk=self.customer.pk).update(phone='')
        self.assertIn('- *A-1*', self._whatsapp())

    def test_formatting_marks_removed(self):
        Customer.objects.filter(pk=self.customer.pk).update(first_name='*Karima*', name='_B_')  # noqa: E501
        self.assertEqual(self._whatsapp(lang='en').split('\n')[1], 'Karima B')

    def test_audit_log_always_due(self):
        self._whatsapp(**{'to': '2026-10-31'})
        self.assertEqual(self.logs().get().changes, {'format': 'whatsapp', 'pending': True, 'rows': 1, 'from': None, 'to': '2026-10-31'})  # noqa: E501


class StatementThrottleTest(StatementTestCase):
    @mock.patch.object(ExportRenderRateThrottle, 'THROTTLE_RATES', {'exports_render': '10/minute'})  # noqa: E501
    def test_pdf_and_whatsapp_limited_per_user(self):
        for i in range(10):
            self.assertEqual(self.client.get(self.url(OUTPUTS[i % 2])).status_code, status.HTTP_200_OK)  # noqa: E501
        for output in OUTPUTS:
            self.assertEqual(self.client.get(self.url(output)).status_code, status.HTTP_429_TOO_MANY_REQUESTS)  # noqa: E501
        self.assertEqual(self.client.get(self.url('summary')).status_code, status.HTTP_200_OK)  # noqa: E501
        self.assertEqual(self.logs().count(), 10)
