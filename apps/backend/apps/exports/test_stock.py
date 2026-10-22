from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.invoices.test_pdf import text_pages
from apps.products.models import Product, ProductVariant
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import SubscriptionPlan
from apps.zakat.services import compute_stock_values

from . import services
from .tests import setup as create_shop
from .tests import subscribe

CSV_HEADER = [
    'Article', 'Format', 'Référence', 'Quantité', "Seuil d'alerte", 'Statut',
    "Prix d'achat", 'Prix de vente', 'Valeur estimée',
]
MORE = '(liste complète en PDF ou CSV)'


def variant(
    shop: Shop, name: str, quantity: str, *, packaging: str = 'Unité',
    purchase: str | None = '1.00', threshold: str | None = None, sku: str = '',
    type_: str = 'product', active: bool = True, product: Product | None = None,
) -> ProductVariant:
    """Format avec un stock donné (données de test : pas de mouvement)."""
    product = product or Product.objects.create(shop=shop, name=name, type=type_)
    return ProductVariant.objects.create(
        shop=shop, product=product, packaging_name=packaging, unit='piece',
        base_quantity=1, selling_price='10.00', purchase_price=purchase,
        stock_quantity=quantity, low_stock_threshold=threshold, sku=sku,
        is_active=active,
    )


class StockExportTestCase(TestCase):
    """Lin & Co à Paris : six formats suivis, dont un négatif, une rupture, un
    stock faible et un format sans prix d'achat ; un service et des formats
    inactifs, jamais exportés."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user, self.shop = create_shop('stock-export@example.com')
        subscribe(self.shop, SubscriptionPlan.CODE_BOUTIQUE)
        Shop.objects.filter(pk=self.shop.pk).update(timezone='Europe/Paris', name='Lin & Co')  # noqa: E501
        self.shop.refresh_from_db()
        self.client.force_authenticate(user=self.user)
        rice = variant(self.shop, 'Riz basmati', '12', packaging='Sac 5 kg', purchase='8.50', threshold='5', sku='RZ-5')  # noqa: E501
        variant(self.shop, "Huile d'olive", '2', packaging='1 L', purchase='6.00', threshold='5')  # noqa: E501
        variant(self.shop, 'Thé vert', '0', packaging='Boîte', purchase='4.00', threshold='3')  # noqa: E501
        variant(self.shop, 'Épices', '-3', packaging='Sachet', purchase='2.00')
        # 0,5 × 0,01 = 0,005 : arrondi au centime supérieur, comme la zakat.
        variant(self.shop, '=1+1', '0.5', packaging='Pain', purchase='0.01')
        variant(self.shop, 'Farine', '4', packaging='Sac 1 kg', purchase=None)
        # Jamais exportés : service, format inactif, article inactif.
        variant(self.shop, 'Coupe', '0', type_='service')
        variant(self.shop, 'Riz basmati', '9', packaging='Sac 25 kg', purchase='30.00', active=False, product=rice.product)  # noqa: E501
        old = variant(self.shop, 'Ancien article', '5')
        Product.objects.filter(pk=old.product_id).update(is_active=False)

    def url(self, output: str) -> str:
        return reverse('exports-stock', kwargs={'output': output})

    def today(self) -> str:
        return timezone.now().astimezone(ZoneInfo('Europe/Paris')).strftime('%d/%m/%Y')

    def _csv(self, **params) -> list[list[str]]:
        response = self.client.get(self.url('csv'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))  # noqa: E501
        body = b''.join(response.streaming_content)
        return [line.split(';') for line in body.decode('utf-8-sig').splitlines()]

    def _whatsapp(self, **params) -> str:
        response = self.client.get(self.url('whatsapp'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['text']

    def _pdf(self, **params) -> str:
        response = self.client.get(self.url('pdf'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))  # noqa: E501
        self.assertEqual(response['Content-Type'], 'application/pdf')
        return '\n'.join(text_pages(response.content))


class StockExportRightsTest(StockExportTestCase):
    """Formule Boutique, module stock et isolation entre boutiques."""

    summary_url = reverse('exports-stock-summary')

    def urls(self) -> tuple[str, ...]:
        return (*(self.url(o) for o in services.FORMATS), self.summary_url)

    def test_free_and_solo_plans_forbidden(self):
        for code in (SubscriptionPlan.CODE_FREE, SubscriptionPlan.CODE_SOLO):
            subscribe(self.shop, code)
            for url in self.urls():
                with self.subTest(code=code, url=url):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        self.assertFalse(AuditLog.objects.filter(action='stock_export').exists())

    def test_boutique_and_commerce_plus_allowed(self):
        for code in (SubscriptionPlan.CODE_BOUTIQUE, SubscriptionPlan.CODE_COMMERCE_PLUS):  # noqa: E501
            subscribe(self.shop, code)
            for url in self.urls():
                with self.subTest(code=code, url=url):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_stock_module_required(self):
        staff = User.objects.create_user(email='stock-export-staff@example.com', password='Pass123!Strong')  # noqa: E501
        member = ShopMember.objects.create(shop=self.shop, user=staff, role='staff', permissions=['orders'])  # noqa: E501
        self.client.force_authenticate(user=staff)
        for url in self.urls():
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)  # noqa: E501
        member.permissions = ['stock']
        member.save(update_fields=['permissions'])
        self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501

    def test_only_own_shop_formats(self):
        _, shop_b = create_shop('stock-export-other@example.com')
        subscribe(shop_b, SubscriptionPlan.CODE_BOUTIQUE)
        variant(shop_b, 'Riz de B', '0', purchase='999.00')
        self.assertNotIn('Riz de B', str(self._csv()))
        self.assertNotIn('Riz de B', self._whatsapp())
        self.assertNotIn('Riz de B', self._pdf())
        self.assertEqual(self.client.get(self.summary_url).data['rows'], 6)

    def test_invalid_parameters_rejected(self):
        for params in ({'scope': 'everything'}, {'ordering': 'product__shop__name'}, {'search': 'x' * 101}):  # noqa: E501
            for url in self.urls():
                with self.subTest(params=params, url=url):
                    self.assertEqual(self.client.get(url, params).status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
        self.assertFalse(AuditLog.objects.filter(action='stock_export').exists())


class StockExportCsvTest(StockExportTestCase):
    def test_header_rows_values_and_filename(self):
        response = self.client.get(self.url('csv'))
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertRegex(response['Content-Disposition'], r'filename="stock-\d{4}-\d{2}-\d{2}\.csv"')  # noqa: E501
        rows = self._csv()
        self.assertEqual(rows[0], CSV_HEADER)
        # Tri par défaut de la page : stock croissant.
        self.assertEqual([r[0] for r in rows[1:]], ['Épices', 'Thé vert', "'=1+1", "Huile d'olive", 'Farine', 'Riz basmati'])  # noqa: E501
        by_name = {r[0]: r for r in rows[1:]}
        # Négatif : quantité signée, jamais neutralisée ; valeur plancher 0.
        self.assertEqual(by_name['Épices'], ['Épices', 'Sachet', '', '-3', '', 'Négatif', '2,00', '10,00', '0,00'])  # noqa: E501
        self.assertEqual(by_name['Riz basmati'], ['Riz basmati', 'Sac 5 kg', 'RZ-5', '12', '5', 'En stock', '8,50', '10,00', '102,00'])  # noqa: E501
        self.assertEqual(by_name["'=1+1"][3:], ['0,5', '', 'En stock', '0,01', '10,00', '0,01'])  # noqa: E501
        self.assertEqual(by_name['Thé vert'][5], 'Rupture')
        self.assertEqual(by_name["Huile d'olive"][5], 'Faible')
        # Sans prix d'achat : prix et valeur vides.
        self.assertEqual(by_name['Farine'][6:], ['', '10,00', ''])

    def test_services_and_inactive_formats_excluded(self):
        names = [(r[0], r[1]) for r in self._csv()[1:]]
        self.assertNotIn(('Coupe', 'Unité'), names)
        self.assertNotIn(('Riz basmati', 'Sac 25 kg'), names)
        self.assertNotIn('Ancien article', [n for n, _ in names])

    def test_english_and_arabic_headers(self):
        en = self._csv(lang='en')
        self.assertEqual(en[0][:4], ['Item', 'Format', 'Reference', 'Quantity'])
        self.assertIn(['Épices', 'Sachet', '', '-3', '', 'Negative', '2.00', '10.00', '0.00'], en)  # noqa: E501
        ar = self._csv(lang='ar')
        self.assertEqual(ar[0][0], 'المنتج')
        self.assertIn('سالب', ar[1])

    def test_scope_search_and_ordering(self):
        restock = self._csv(scope='restock')
        self.assertEqual([r[0] for r in restock[1:]], ['Épices', 'Thé vert', "Huile d'olive"])  # noqa: E501
        self.assertEqual([r[0] for r in self._csv(search='riz')[1:]], ['Riz basmati'])
        self.assertEqual([r[0] for r in self._csv(search='rz-5')[1:]], ['Riz basmati'])
        # Collation de la base : « É » trié avec les « E ».
        by_name = [r[0] for r in self._csv(ordering='name')[1:]]
        self.assertEqual(by_name, ["'=1+1", 'Épices', 'Farine', "Huile d'olive", 'Riz basmati', 'Thé vert'])  # noqa: E501
        by_value = [r[0] for r in self._csv(ordering='-purchase_value')[1:]]
        self.assertEqual(by_value[:2], ['Riz basmati', "Huile d'olive"])

    def test_export_logged(self):
        self._csv(scope='restock', search='riz')
        log = AuditLog.objects.get(action='stock_export')
        self.assertEqual((log.user, log.shop_id, log.model_name), (self.user, self.shop.id, 'Shop'))  # noqa: E501
        self.assertEqual(log.changes, {'format': 'csv', 'rows': 0, 'scope': 'restock', 'search': True})  # noqa: E501


class StockExportTotalsTest(StockExportTestCase):
    def test_estimated_value_matches_zakat_stock(self):
        # Σ max(0, quantité) × prix d'achat : 102 + 12 + 0 + 0 + 0,005.
        dataset = self._dataset()
        totals = {t.key: t.value for t in dataset.totals}
        self.assertEqual(totals['value'], Decimal('114.01'))
        self.assertEqual(totals['value'], compute_stock_values(self.shop).purchase)
        self.assertEqual((totals['formats'], totals['out'], totals['low'], totals['negative']), (6, 1, 1, 1))  # noqa: E501
        self.assertEqual(dataset.totals_note, "1 format sans prix d'achat, hors valeur estimée")  # noqa: E501

    def test_no_negative_total_without_negative_stock(self):
        ProductVariant.objects.filter(stock_quantity__lt=0).update(stock_quantity=1)
        ProductVariant.objects.filter(purchase_price__isnull=True).update(purchase_price='1.00')  # noqa: E501
        dataset = self._dataset()
        self.assertEqual([t.key for t in dataset.totals], ['formats', 'value', 'out', 'low'])  # noqa: E501
        self.assertEqual(dataset.totals_note, '')
        self.assertEqual(dataset.totals[1].value, compute_stock_values(self.shop).purchase)  # noqa: E501

    def _dataset(self) -> services.ExportDataset:
        from .stock_dataset import StockFilters, export_stock_queryset, stock_dataset
        qs = export_stock_queryset(self.shop, StockFilters())
        return stock_dataset(self.shop, qs, StockFilters(), 'fr')


class StockExportWhatsappTest(StockExportTestCase):
    def test_restock_list_out_of_stock_first(self):
        # Périmètre demandé ignoré : le message liste ce qui est à réapprovisionner.
        response = self.client.get(self.url('whatsapp'), {'scope': 'all', 'ordering': 'name'})  # noqa: E501
        self.assertEqual(response.data['rows'], 3)
        self.assertNotIn('Content-Disposition', response)
        lines = response.data['text'].split('\n')
        self.assertEqual(lines[:2], ['*À réapprovisionner · Lin & Co*', f'Au {self.today()}'])  # noqa: E501
        detail = [line for line in lines if line.startswith('- *')]
        self.assertEqual(detail, [
            '- *Épices* · Sachet · -3 · Négatif',
            '- *Thé vert* · Boîte · 0 · Rupture (seuil 3)',
            "- *Huile d'olive* · 1 L · 2 · Faible (seuil 5)",
        ])
        for line in ('- Formats : 3', '- En rupture : 1', '- Stock faible : 1', '- Négatif : 1'):  # noqa: E501
            self.assertIn(line, lines)
        self.assertNotIn('autre', response.data['text'])
        log = AuditLog.objects.get(action='stock_export')
        self.assertEqual((log.changes['format'], log.changes['scope']), ('whatsapp', 'restock'))  # noqa: E501

    def test_fifteen_rows_then_remainder_in_three_languages(self):
        for i in range(14):
            variant(self.shop, f'Rupture {i:02}', '0')
        text = self._whatsapp()
        detail = [line for line in text.split('\n') if line.startswith('- *')]
        self.assertEqual(len(detail), services.WHATSAPP_MAX_ROWS)
        self.assertTrue(text.endswith(f'… et 2 autres formats {MORE}'))
        self.assertTrue(self._whatsapp(lang='en').endswith('… and 2 more formats (full list in the PDF or CSV)'))  # noqa: E501
        self.assertTrue(self._whatsapp(lang='ar').endswith('… والأشكال المتبقية: 2 (القائمة الكاملة في ملف PDF أو CSV)'))  # noqa: E501
        ProductVariant.objects.filter(product__name='Rupture 00').delete()
        self.assertTrue(self._whatsapp().endswith(f'… et 1 autre format {MORE}'))

    def test_nothing_to_restock(self):
        ProductVariant.objects.filter(stock_quantity__lte=2).update(stock_quantity=20)
        text = self._whatsapp()
        self.assertEqual(text.split('\n'), ['*À réapprovisionner · Lin & Co*', f'Au {self.today()}', '', 'Rien à réapprovisionner'])  # noqa: E501
        self.assertTrue(self._whatsapp(lang='en').endswith('\nNothing to restock'))
        self.assertTrue(self._whatsapp(lang='ar').endswith('\nلا شيء بحاجة إلى تموين'))

    def test_search_kept_and_marks_removed(self):
        ProductVariant.objects.filter(packaging_name='Boîte').update(packaging_name='*Boîte*')  # noqa: E501
        text = self._whatsapp(search='thé', lang='en')
        self.assertTrue(text.startswith('*To restock · Lin & Co*\nAs of '))
        self.assertIn('Filters: Search “thé”', text)
        self.assertIn('- *Thé vert* · Boîte · 0 · Out (threshold 3)', text)
        self.assertNotIn('Épices', text)


class StockExportPdfTest(StockExportTestCase):
    def test_header_totals_rows_and_note(self):
        response = self.client.get(self.url('pdf'), {'scope': 'restock'})
        self.assertRegex(response['Content-Disposition'], r'filename="reapprovisionnement-\d{4}-\d{2}-\d{2}\.pdf"')  # noqa: E501
        text = self._pdf()
        for expected in (
            'Lin & Co', 'Stock', f'Au {self.today()}', 'Généré le', '114,01',
            "1 format sans prix d'achat, hors valeur estimée", 'Riz basmati',
            'Sac 5 kg', 'RZ-5', 'Négatif', 'Rupture', 'Faible', 'Page 1 sur 1',
        ):
            self.assertIn(expected, text)

    def test_arabic_falls_back_to_french_english_kept(self):
        self.assertIn(f'Au {self.today()}', self._pdf(lang='ar'))
        text = self._pdf(lang='en', scope='restock')
        self.assertIn('To restock', text)
        self.assertIn('Page 1 of 1', text)

    def test_empty_restock(self):
        ProductVariant.objects.filter(stock_quantity__lte=2).update(stock_quantity=20)
        self.assertIn('Rien à réapprovisionner', self._pdf(scope='restock'))

    def test_row_cap_proposes_csv(self):
        with mock.patch.object(services, 'PDF_MAX_ROWS', 2):
            response = self.client.get(self.url('pdf'))
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual((response.data['code'], response.data['max_rows']), ('pdf_row_limit', 2))  # noqa: E501
            self.assertIn('formats', response.data['detail'])
            self.assertEqual(self.client.get(self.url('csv')).status_code, status.HTTP_200_OK)  # noqa: E501
        formats = list(AuditLog.objects.filter(action='stock_export').values_list('changes__format', flat=True))  # noqa: E501
        self.assertEqual(formats, ['csv'])
