"""Scan d'emballage (URS-109) : endpoint, pipeline, quota vision, Open Food Facts."""
from __future__ import annotations

import json
import logging
import threading
from unittest.mock import patch

import httpx
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.core.test_utils import image_bytes
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.permissions import FEATURE_MIN_PLAN
from apps.subscriptions.test_utils import attach_subscription

from . import open_food_facts
from .ai_client import (
    AiProductScanLocal,
    AiProductVision,
    AiScanField,
    AiServiceUnavailableError,
    ScanPhoto,
    scan_product_locally_with_ai_service,
    scan_product_vision_with_ai_service,
)
from .factories import ProductScanUsageFactory
from .models import ProductScanUsage
from .open_food_facts import OpenFoodFactsProduct, is_restricted_gtin, is_valid_gtin
from .services import reserve_vision_scan, scan_quota_month
from .throttles import ProductScanRateThrottle

URL = '/api/ocr/product-scan/'
JPEG_BYTES = image_bytes('JPEG')
PNG_BYTES = image_bytes('PNG')
NUTELLA_EAN = '3017620422003'
_TEST_AI_KEY = 'test-internal-key-product-scan'
_CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    'throttle': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'product-scan-throttle-tests',
    },
    'product_lookups': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'product-scan-tests',
    },
    'product_scans': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'product-scan-faces-tests',
    },
}
# Texte « lu » sur l'emballage : ne doit jamais apparaître dans un journal.
SECRET_TEXT = 'Biscuits Secrets Maison'
FACE = ScanPhoto(JPEG_BYTES, 'image/jpeg')


def make_user_shop(
    email: str, plan_code: str = SubscriptionPlan.CODE_FREE,
) -> tuple[User, Shop]:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    attach_subscription(shop, plan_code=plan_code)
    return user, shop


def field(value: str, confidence: float) -> AiScanField:
    return AiScanField(value=value, confidence=confidence)


def local_result(**overrides: object) -> AiProductScanLocal:
    values: dict[str, object] = {
        'barcode': None, 'brand': None, 'product_name': None, 'variant': None,
        'claims': (), 'net_quantity': None, 'structuring': 'disabled',
        'vision_recommended': False, 'vision_available': False,
    }
    values.update(overrides)
    return AiProductScanLocal(**values)  # type: ignore[arg-type]


def vision_result(**overrides: object) -> AiProductVision:
    values: dict[str, object] = {
        'brand': None, 'product_name': None, 'variant': None, 'claims': (),
        'net_quantity': None, 'barcode': None, 'confidence': None,
    }
    values.update(overrides)
    return AiProductVision(**values)  # type: ignore[arg-type]


def ziyada_result(**overrides: object) -> AiProductScanLocal:
    """Lecture structurée du pot Ziyada (voir le jeu d'étalon d'ai-service)."""
    values: dict[str, object] = {
        'brand': field('Ziyada', 0.85),
        'product_name': field("Déo crème à l'huile de nigelle", 0.85),
        'variant': field('Tahara Caramel', 0.85),
        'claims': (field("98 % d'ingrédients naturels", 0.85), field('24 h', 0.85)),
        'structuring': 'done',
    }
    values.update(overrides)
    return local_result(**values)


def jpeg(content: bytes = JPEG_BYTES, content_type: str = 'image/jpeg') -> SimpleUploadedFile:  # noqa: E501
    return SimpleUploadedFile('photo.jpg', content, content_type=content_type)


# Lectures avancées éteintes ici : le plafond est testé dans `test_product_scan_quota`.
@override_settings(
    CACHES=_CACHES, PRODUCT_SCAN_VISION_THRESHOLD=0.7, PRODUCT_SCAN_AI_ENABLED=False,
)
class ProductScanViewTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('scan@example.com')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.local = patch('apps.ocr.services.scan_product_locally_with_ai_service').start()  # noqa: E501
        self.vision = patch('apps.ocr.services.scan_product_vision_with_ai_service').start()  # noqa: E501
        self.lookup = patch('apps.ocr.services.lookup_barcode', return_value=None).start()  # noqa: E501
        self.addCleanup(patch.stopall)

    def _post(
        self, upload: SimpleUploadedFile | None = None,
        back: SimpleUploadedFile | None = None,
    ) -> object:
        data = {'image': upload or jpeg()}
        if back is not None:
            data['image_back'] = back
        return self.client.post(URL, data, format='multipart')

    def test_barcode_and_open_food_facts_prefill(self) -> None:
        self.local.return_value = local_result(
            barcode=field(NUTELLA_EAN, 1.0), product_name=field('NUTELLA', 0.4),
            claims=(field('Pâte à tartiner aux noisettes', 0.6),),
        )
        self.lookup.return_value = OpenFoodFactsProduct('Nutella', 'Ferrero', '400 g')

        response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        fields = response.data['fields']
        self.assertEqual(fields['barcode'], {
            'value': NUTELLA_EAN, 'confidence': 1.0, 'source': 'barcode',
        })
        self.assertEqual(fields['product_name']['value'], 'Nutella')
        self.assertEqual(fields['name']['value'], 'Ferrero Nutella 400 g')
        self.assertEqual(fields['name']['source'], 'open_food_facts')
        self.assertEqual(fields['brand']['value'], 'Ferrero')
        self.assertEqual(fields['net_quantity']['value'], '400 g')
        self.assertEqual(fields['description']['source'], 'ocr')
        self.assertEqual(fields['unit_suggestion']['value'], 'piece')
        self.assertEqual(response.data['warnings'], [])
        self.lookup.assert_called_once_with(NUTELLA_EAN)
        self.vision.assert_not_called()
        self.assertFalse(ProductScanUsage.objects.exists())

    def test_audit_entry_lists_sources_without_content(self) -> None:
        self.local.return_value = local_result(
            product_name=field(SECRET_TEXT, 0.9), structuring='done',
        )
        self._post()

        log = AuditLog.objects.get(shop_id=self.shop.pk, action='product_scan')
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.changes, {
            'sources': ['ocr'], 'photos': 1, 'text': 'done', 'vision': 'not_needed',
        })
        self.assertNotIn(SECRET_TEXT, str(log.changes) + log.object_repr)

    def test_uncertain_field_is_null_and_no_unit_without_clue(self) -> None:
        self.local.return_value = local_result(
            product_name=field('Savon', 0.9), claims=(field('???', 0.3),),
        )
        fields = self._post().data['fields']
        self.assertEqual(fields['name']['value'], 'Savon')
        self.assertIsNone(fields['description'])
        self.assertIsNone(fields['unit_suggestion'])
        self.assertIsNone(fields['barcode'])

    def test_invalid_ean_from_ai_service_is_dropped(self) -> None:
        self.local.return_value = local_result(
            barcode=field('3017620422004', 1.0), product_name=field('Savon', 0.9),
        )
        fields = self._post().data['fields']
        self.assertIsNone(fields['barcode'])
        self.lookup.assert_not_called()

    def test_weighed_item_barcode_suggests_no_unit(self) -> None:
        self.local.return_value = local_result(
            barcode=field('2123456000009', 1.0), product_name=field('Comté', 0.9),
            net_quantity=field('250 g', 0.9),
        )
        self.assertIsNone(self._post().data['fields']['unit_suggestion'])

    # ─── Composition du nom et de la description ──────────────────────────

    def test_ziyada_name_is_brand_designation_variant(self) -> None:
        self.local.return_value = ziyada_result()
        fields = self._post().data['fields']
        self.assertEqual(
            fields['name']['value'],
            "Ziyada Déo crème à l'huile de nigelle Tahara Caramel",
        )
        self.assertEqual(fields['name']['source'], 'ocr')
        self.assertEqual(fields['product_name']['value'], "Déo crème à l'huile de nigelle")  # noqa: E501
        self.assertEqual(fields['variant']['value'], 'Tahara Caramel')
        self.assertEqual(fields['brand']['value'], 'Ziyada')

    def test_description_is_claims_never_the_designation(self) -> None:
        self.local.return_value = ziyada_result()
        description = self._post().data['fields']['description']['value']
        self.assertEqual(description, "98 % d'ingrédients naturels, 24 h")
        self.assertNotIn('nigelle', description)

    def test_no_claims_means_no_description(self) -> None:
        self.local.return_value = ziyada_result(claims=())
        self.assertIsNone(self._post().data['fields']['description'])

    def test_brand_of_the_shop_itself_is_not_prefixed(self) -> None:
        self.shop.name = 'ZIYÂDA'  # même marque, sans casse ni accent
        self.shop.save(update_fields=['name'])
        self.local.return_value = ziyada_result(net_quantity=field('50 ml', 0.85))
        name = self._post().data['fields']['name']['value']
        self.assertEqual(name, "Déo crème à l'huile de nigelle Tahara Caramel 50 ml")

    def test_part_already_in_the_designation_is_not_repeated(self) -> None:
        self.local.return_value = local_result(
            brand=field('Lactel', 0.85),
            product_name=field('Lactel lait demi-écrémé', 0.85),
            variant=field('Or', 0.85), net_quantity=field('1 L', 0.85),
        )
        name = self._post().data['fields']['name']['value']
        # Marque déjà en tête de la désignation : pas répétée. « Or » n'est pas
        # « contenu » dans un mot plus long : seuls les mots entiers comptent.
        self.assertEqual(name, 'Lactel lait demi-écrémé Or 1 L')

    def test_shop_data_never_leaves_for_ai_service(self) -> None:
        self.shop.name = 'Boutique Secrète Yasmine'
        self.shop.save(update_fields=['name'])
        self.local.return_value = ziyada_result(vision_recommended=True, vision_available=True)  # noqa: E501
        self.vision.return_value = vision_result()
        self._post()
        for mock in (self.local, self.vision):
            self.assertEqual(set(mock.call_args.kwargs) - {'face', 'back', 'structure'}, set())  # noqa: E501
            self.assertNotIn('Yasmine', repr(mock.call_args))

    # ─── Deux photos : face et dos ───────────────────────────────────────

    def test_back_photo_is_forwarded(self) -> None:
        self.local.return_value = ziyada_result()
        back = jpeg(JPEG_BYTES + b'back')
        response = self._post(back=back)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        kwargs = self.local.call_args.kwargs
        self.assertEqual(kwargs['face'], ScanPhoto(JPEG_BYTES, 'image/jpeg'))
        self.assertEqual(kwargs['back'], ScanPhoto(JPEG_BYTES + b'back', 'image/jpeg'))
        log = AuditLog.objects.get(shop_id=self.shop.pk, action='product_scan')
        self.assertEqual(log.changes['photos'], 2)

    def test_single_photo_sends_no_back(self) -> None:
        self.local.return_value = ziyada_result()
        self._post()
        self.assertIsNone(self.local.call_args.kwargs['back'])

    def test_invalid_back_photo_returns_its_code(self) -> None:
        response = self._post(back=jpeg(PNG_BYTES))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'signature')
        self.local.assert_not_called()

    def test_vision_receives_only_the_face(self) -> None:
        self.local.return_value = local_result(
            product_name=field('NUT', 0.4), vision_available=True,
        )
        self.vision.return_value = vision_result(product_name='Nutella', confidence=0.9)
        self._post(back=jpeg(JPEG_BYTES + b'back'))
        self.assertEqual(self.vision.call_args.kwargs, {
            'face': ScanPhoto(JPEG_BYTES, 'image/jpeg'),
        })

    # ─── Secours image ───────────────────────────────────────────────────

    def test_vision_fallback_fills_uncertain_name_and_counts(self) -> None:
        self.local.return_value = local_result(
            product_name=field('NUT', 0.4), vision_available=True,
        )
        self.vision.return_value = vision_result(
            product_name='Nutella', brand='Ferrero', net_quantity='400 g',
            claims=('Aux noisettes',), confidence=0.95,
        )
        response = self._post()

        fields = response.data['fields']
        name = fields['name']
        self.assertEqual((name['value'], name['source']), ('Ferrero Nutella 400 g', 'vision'))  # noqa: E501
        # Une réponse de modèle reste sous une base publique ou un code lu.
        self.assertEqual(name['confidence'], 0.85)
        self.assertEqual(fields['description']['value'], 'Aux noisettes')
        self.assertEqual(fields['unit_suggestion']['source'], 'vision')
        usage = ProductScanUsage.objects.get(shop=self.shop)
        self.assertEqual(usage.vision_count, 1)
        self.assertEqual(usage.month, scan_quota_month(self.shop))
        log = AuditLog.objects.get(shop_id=self.shop.pk, action='product_scan')
        self.assertEqual(log.changes['vision'], 'used')

    def test_semantic_trigger_calls_vision_on_a_confident_ocr_name(self) -> None:
        # « ZIYADA » à 0,8 : au-dessus du seuil, mais c'est la marque, pas la désignation.  # noqa: E501
        self.local.return_value = local_result(
            product_name=field('ZIYADA', 0.8), vision_recommended=True,
            vision_available=True,
        )
        self.vision.return_value = vision_result(
            brand='Ziyada', product_name="Déo crème à l'huile de nigelle", confidence=0.9,  # noqa: E501
        )
        fields = self._post().data['fields']
        self.vision.assert_called_once()
        self.assertEqual(fields['product_name']['value'], "Déo crème à l'huile de nigelle")  # noqa: E501
        self.assertEqual(fields['product_name']['source'], 'vision')

    def test_semantic_trigger_ignored_for_open_food_facts_name(self) -> None:
        self.local.return_value = local_result(
            barcode=field(NUTELLA_EAN, 1.0), vision_recommended=True,
            vision_available=True,
        )
        self.lookup.return_value = OpenFoodFactsProduct('Nutella', 'Ferrero', '400 g')
        self._post()
        self.vision.assert_not_called()

    def test_confident_specific_name_needs_no_vision(self) -> None:
        self.local.return_value = ziyada_result(vision_available=True)
        response = self._post()
        self.vision.assert_not_called()
        log = AuditLog.objects.get(shop_id=self.shop.pk, action='product_scan')
        self.assertEqual(log.changes['vision'], 'not_needed')
        self.assertEqual(response.data['warnings'], [])

    def test_vision_skipped_when_image_fallback_disabled(self) -> None:
        self.local.return_value = local_result(
            product_name=field('NUT', 0.4), vision_recommended=True,
        )
        response = self._post()
        self.assertEqual(response.data['warnings'], [])
        self.vision.assert_not_called()
        self.assertFalse(ProductScanUsage.objects.exists())
        log = AuditLog.objects.get(shop_id=self.shop.pk, action='product_scan')
        self.assertEqual(log.changes['vision'], 'disabled')

    def test_quota_reached_returns_local_result_with_warning(self) -> None:
        ProductScanUsageFactory(
            shop=self.shop, month=scan_quota_month(self.shop), vision_count=5,
        )
        self.local.return_value = local_result(
            product_name=field('NUT', 0.55), vision_available=True,
        )
        response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['warnings'], ['vision_quota_reached'])
        self.assertEqual(response.data['fields']['name']['value'], 'NUT')
        self.vision.assert_not_called()
        self.assertEqual(ProductScanUsage.objects.get(shop=self.shop).vision_count, 5)

    def test_vision_failure_refunds_quota_with_warning(self) -> None:
        self.local.return_value = local_result(
            product_name=field('NUT', 0.4), vision_available=True,
        )
        self.vision.side_effect = AiServiceUnavailableError('down')
        response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['warnings'], ['vision_unavailable'])
        self.assertEqual(ProductScanUsage.objects.get(shop=self.shop).vision_count, 0)

    def test_counter_of_another_shop_is_invisible(self) -> None:
        _, other = make_user_shop('other-scan@example.com')
        ProductScanUsageFactory(shop=other, month=scan_quota_month(other), vision_count=5)  # noqa: E501
        self.local.return_value = local_result(
            product_name=field('NUT', 0.4), vision_available=True,
        )
        self.vision.return_value = vision_result(product_name='Nutella', confidence=0.9)

        response = self._post()

        self.assertEqual(response.data['warnings'], [])
        self.assertEqual(ProductScanUsage.objects.get(shop=self.shop).vision_count, 1)
        self.assertEqual(ProductScanUsage.objects.get(shop=other).vision_count, 5)
        self.assertFalse(AuditLog.objects.filter(shop_id=other.pk).exists())

    def test_ai_service_unavailable_returns_generic_503(self) -> None:
        self.local.side_effect = AiServiceUnavailableError(
            'Service IA a renvoyé une erreur HTTP 500.',
        )
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(
            response.data, {'detail': "La lecture de l'image est indisponible pour le moment."},  # noqa: E501
        )
        self.assertFalse(AuditLog.objects.filter(action='product_scan').exists())

    def test_rejects_unsupported_type(self) -> None:
        response = self._post(SimpleUploadedFile('f.gif', b'GIF89a' + b'\0' * 10, 'image/gif'))  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'type')
        self.local.assert_not_called()

    def test_rejects_signature_mismatch(self) -> None:
        response = self._post(jpeg(PNG_BYTES))
        self.assertEqual(response.data['code'], 'signature')
        self.local.assert_not_called()

    def test_rejects_empty_file(self) -> None:
        response = self._post(jpeg(b''))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.local.assert_not_called()

    @override_settings(PRODUCT_SCAN_MAX_SIZE_MB=1)
    def test_rejects_oversized_file(self) -> None:
        response = self._post(jpeg(JPEG_BYTES + b'\0' * (1024 * 1024)))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'too_large')
        self.local.assert_not_called()

    def test_large_image_stays_in_memory(self) -> None:
        """3 Mo dépasse le seuil de Django (2,5 Mo) au-delà duquel il écrit sur disque."""  # noqa: E501
        content = JPEG_BYTES + b'\0' * (3 * 1024 * 1024)
        self.local.return_value = local_result(product_name=field('Savon', 0.9))
        with patch(
            'django.core.files.uploadedfile.TemporaryUploadedFile.__init__',
            side_effect=AssertionError('image écrite sur disque'),
        ), patch('tempfile.NamedTemporaryFile', side_effect=AssertionError('disque')):
            response = self._post(jpeg(content))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self.local.call_args.kwargs['face'].content, content)

    def test_staff_without_products_module_denied(self) -> None:
        staff = User.objects.create_user(email='scan-staff@example.com', password='Pass123!Strong')  # noqa: E501
        ShopMember.objects.create(shop=self.shop, user=staff, role='staff', permissions=['stock'])  # noqa: E501
        self.client.force_authenticate(user=staff)
        self.assertEqual(self._post().status_code, status.HTTP_403_FORBIDDEN)
        self.local.assert_not_called()

    def test_plan_gating(self) -> None:
        with patch.dict(FEATURE_MIN_PLAN, {'product_scan': SubscriptionPlan.CODE_SOLO}):
            self.assertEqual(self._post().status_code, status.HTTP_403_FORBIDDEN)
        self.local.assert_not_called()

    def test_requires_authentication(self) -> None:
        response = APIClient().post(URL, {'image': jpeg()}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rate_limited(self) -> None:
        self.local.return_value = local_result(product_name=field('Savon', 0.9))
        with patch.object(ProductScanRateThrottle, 'THROTTLE_RATES', {'product_scan': '2/minute'}):  # noqa: E501
            codes = [self._post().status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, status.HTTP_429_TOO_MANY_REQUESTS])


class _FakeResponse:
    def __init__(self, status_code: int, payload: object = None) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


@override_settings(
    CACHES=_CACHES,
    AI_SERVICE_URL='http://ai-service:8000',
    AI_SERVICE_API_KEY=_TEST_AI_KEY,
    AI_SERVICE_PRODUCT_SCAN_TIMEOUT_SECONDS=41.0,
    PRODUCT_SCAN_AI_ENABLED=True,
)
class ProductScanLogsTest(TestCase):
    """Bout en bout jusqu'à httpx : ni image, ni texte lu, ni clé dans les journaux."""

    def test_no_content_in_logs(self) -> None:
        user, shop = make_user_shop('scan-logs@example.com')
        client = APIClient()
        client.force_authenticate(user=user)
        responses = [
            _FakeResponse(200, {
                'barcode': None,
                'product_name': {'value': SECRET_TEXT, 'confidence': 0.4},
                'brand': None, 'variant': None, 'net_quantity': None,
                'claims': [{'value': SECRET_TEXT, 'confidence': 0.9}],
                'structuring': 'done', 'vision_recommended': True,
                'vision_available': True,
            }),
            _FakeResponse(502, {'detail': f'provider said {SECRET_TEXT}'}),
        ]
        with patch('apps.ocr.ai_client.httpx.post', side_effect=responses) as post, \
                self.assertLogs(level=logging.DEBUG) as logs:
            response = client.post(
                URL, {'image': jpeg(), 'image_back': jpeg(JPEG_BYTES + b'back')},
                format='multipart',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['warnings'], ['vision_unavailable'])
        output = '\n'.join(logs.output)
        for secret in (SECRET_TEXT, _TEST_AI_KEY, 'JFIF'):
            self.assertNotIn(secret, output)
        paths = [call.args[0] for call in post.call_args_list]
        self.assertEqual(paths, [
            'http://ai-service:8000/internal/product-scan',
            'http://ai-service:8000/internal/product-scan/vision',
        ])
        self.assertEqual(post.call_args.kwargs['timeout'], 41.0)
        local_call, vision_call = post.call_args_list
        self.assertEqual(local_call.kwargs['files'], {
            'image': ('scan', JPEG_BYTES, 'image/jpeg'),
            'image_back': ('scan-back', JPEG_BYTES + b'back', 'image/jpeg'),
        })
        # Le secours image ne reçoit que la face.
        self.assertEqual(set(vision_call.kwargs['files']), {'image'})
        # Aucune donnée de la boutique ne part : les photos, et la demande de
        # structuration (place de lecture avancée réservée).
        self.assertEqual(local_call.kwargs['data'], {'structure': 'true'})
        self.assertEqual(
            set(local_call.kwargs), {'headers', 'files', 'timeout', 'data'},
        )
        self.assertEqual(set(vision_call.kwargs), {'headers', 'files', 'timeout'})
        for call in post.call_args_list:
            self.assertNotIn(shop.name, repr(call))


@override_settings(
    AI_SERVICE_URL='http://ai-service:8000',
    AI_SERVICE_API_KEY=_TEST_AI_KEY,
    AI_SERVICE_PRODUCT_SCAN_TIMEOUT_SECONDS=41.0,
)
class ProductScanAiClientTest(SimpleTestCase):
    def _local(self, response: object) -> AiProductScanLocal:
        with patch('apps.ocr.ai_client.httpx.post', return_value=response) as post:
            result = scan_product_locally_with_ai_service(face=FACE)
        headers = post.call_args.kwargs['headers']
        self.assertEqual(headers, {'X-Internal-API-Key': _TEST_AI_KEY})
        return result

    def test_parses_local_result(self) -> None:
        result = self._local(_FakeResponse(200, {
            'barcode': {'value': NUTELLA_EAN, 'confidence': 1.0},
            'barcode_format': 'EAN13',
            'product_name': {'value': '  Nutella \n 400 g ', 'confidence': 0.8},
            'brand': None, 'variant': {'value': 'Noisettes', 'confidence': 0.7},
            'claims': [
                {'value': 'Sans huile de palme', 'confidence': 0.7}, None,
                {'value': '  ', 'confidence': 0.7},
            ] + [{'value': f'claim {i}', 'confidence': 0.5} for i in range(6)],
            'net_quantity': {'value': '', 'confidence': 0.5},
            'structuring': 'surprise', 'vision_recommended': 1,
            'vision_available': 'yes',
        }))
        self.assertEqual(result.barcode, AiScanField(NUTELLA_EAN, 1.0))
        self.assertEqual(result.product_name, AiScanField('Nutella 400 g', 0.8))
        self.assertEqual(result.variant, AiScanField('Noisettes', 0.7))
        # Au plus cinq allégations reçues ; les vides sont écartées.
        self.assertEqual(result.claims, (
            AiScanField('Sans huile de palme', 0.7), AiScanField('claim 0', 0.5),
            AiScanField('claim 1', 0.5),
        ))
        self.assertIsNone(result.net_quantity)
        self.assertEqual(result.structuring, 'disabled')
        # Seul un vrai booléen active le secours.
        self.assertFalse(result.vision_recommended)
        self.assertFalse(result.vision_available)

    def test_structure_flag_is_explicit(self) -> None:
        for kwargs, expected in (({}, 'false'), ({'structure': True}, 'true')):
            with patch('apps.ocr.ai_client.httpx.post', return_value=_FakeResponse(200, {})) as post:  # noqa: E501
                scan_product_locally_with_ai_service(face=FACE, **kwargs)
            self.assertEqual(post.call_args.kwargs['data'], {'structure': expected})

    def test_skipped_structuring_is_parsed(self) -> None:
        result = self._local(_FakeResponse(200, {'structuring': 'skipped'}))
        self.assertEqual(result.structuring, 'skipped')

    def test_back_photo_is_sent_as_image_back(self) -> None:
        back = ScanPhoto(b'back', 'image/png')
        with patch('apps.ocr.ai_client.httpx.post', return_value=_FakeResponse(200, {})) as post:  # noqa: E501
            scan_product_locally_with_ai_service(face=FACE, back=back)
        self.assertEqual(post.call_args.kwargs['files']['image_back'], ('scan-back', b'back', 'image/png'))  # noqa: E501

    def test_invalid_contract_raises(self) -> None:
        for payload in (
            [], {'product_name': 'Nutella'},
            {'product_name': {'value': 'x', 'confidence': 1.5}},
            {'brand': {'value': 42, 'confidence': 0.5}}, {'claims': 'x'},
            {'claims': ['x']},
        ):
            with self.subTest(payload=payload), self.assertRaises(AiServiceUnavailableError):  # noqa: E501
                self._local(_FakeResponse(200, payload))

    def test_http_and_transport_errors_raise(self) -> None:
        for response in (_FakeResponse(400), _FakeResponse(500), _FakeResponse(200, json.JSONDecodeError('x', '', 0))):  # noqa: E501
            with self.subTest(status=response.status_code), self.assertRaises(AiServiceUnavailableError):  # noqa: E501
                self._local(response)
        for exc in (httpx.ReadTimeout('t'), httpx.ConnectError('c')):
            with patch('apps.ocr.ai_client.httpx.post', side_effect=exc), \
                    self.assertRaises(AiServiceUnavailableError):
                scan_product_locally_with_ai_service(face=FACE)

    def test_parses_vision_result(self) -> None:
        payload = {
            'brand': None, 'product_name': 'Nutella', 'variant': ' Noisettes ',
            'claims': ['Sans huile de palme', ''], 'net_quantity': '400 g',
            'unit': 'g', 'barcode': None, 'confidence': 0.9,
        }
        with patch('apps.ocr.ai_client.httpx.post', return_value=_FakeResponse(200, payload)):  # noqa: E501
            result = scan_product_vision_with_ai_service(face=FACE)
        self.assertEqual(result.product_name, 'Nutella')
        self.assertEqual(result.variant, 'Noisettes')
        self.assertEqual(result.claims, ('Sans huile de palme',))
        self.assertEqual(result.confidence, 0.9)


class GtinTest(SimpleTestCase):
    def test_valid_gtins(self) -> None:
        for value in (NUTELLA_EAN, '96385074', '036000291452', '10012345678902'):
            with self.subTest(value=value):
                self.assertTrue(is_valid_gtin(value))

    def test_invalid_gtins(self) -> None:
        for value in (
            '3017620422004', '301762042200', '30176204220031', 'abcdefghijklm',
            '3017620422 03', '٣٠١٧٦٢٠٤٢٢٠٠٣', '../../../etc', '',
        ):
            with self.subTest(value=value):
                self.assertFalse(is_valid_gtin(value))

    def test_restricted_prefixes(self) -> None:
        self.assertTrue(is_restricted_gtin('2123456000009'))
        self.assertTrue(is_restricted_gtin('0212345000007'))
        self.assertTrue(is_restricted_gtin('20123451'))
        self.assertFalse(is_restricted_gtin(NUTELLA_EAN))
        self.assertFalse(is_restricted_gtin('96385074'))


@override_settings(CACHES=_CACHES, OPEN_FOOD_FACTS_TIMEOUT_SECONDS=3.0)
class OpenFoodFactsTest(SimpleTestCase):
    def setUp(self) -> None:
        from django.core.cache import caches
        caches['product_lookups'].clear()

    def _found(self) -> _FakeResponse:
        return _FakeResponse(200, {'status': 1, 'product': {
            'product_name': 'Nutella', 'product_name_fr': '', 'brands': 'Ferrero, Nutella',  # noqa: E501
            'quantity': '400 g',
        }})

    def test_fixed_domain_and_only_the_ean_leaves(self) -> None:
        with patch.object(open_food_facts.httpx, 'get', return_value=self._found()) as get:  # noqa: E501
            product = open_food_facts.lookup_barcode(NUTELLA_EAN)
        self.assertEqual(product, OpenFoodFactsProduct('Nutella', 'Ferrero', '400 g'))
        self.assertEqual(
            get.call_args.args[0],
            f'https://world.openfoodfacts.org/api/v2/product/{NUTELLA_EAN}.json',
        )
        self.assertEqual(get.call_args.kwargs['timeout'], 3.0)
        self.assertFalse(get.call_args.kwargs['follow_redirects'])
        self.assertEqual(set(get.call_args.kwargs['params']), {'fields'})

    def test_invalid_or_restricted_ean_never_leaves(self) -> None:
        with patch.object(open_food_facts.httpx, 'get') as get:
            for value in ('3017620422004', 'evil.com/x', '2123456000009'):
                self.assertIsNone(open_food_facts.lookup_barcode(value))
        get.assert_not_called()

    def test_cached_for_thirty_days(self) -> None:
        cache = open_food_facts.caches['product_lookups']
        with (
            patch.object(open_food_facts.httpx, 'get', return_value=self._found()) as get,  # noqa: E501
            patch.object(cache, 'set') as cache_set,
        ):
            open_food_facts.lookup_barcode(NUTELLA_EAN)
        get.assert_called_once()
        self.assertEqual(cache_set.call_args.args[2], 30 * 24 * 3600)

    def test_second_lookup_hits_cache(self) -> None:
        with patch.object(open_food_facts.httpx, 'get', return_value=self._found()) as get:  # noqa: E501
            first = open_food_facts.lookup_barcode(NUTELLA_EAN)
            second = open_food_facts.lookup_barcode(NUTELLA_EAN)
        self.assertEqual(first, second)
        get.assert_called_once()

    def test_not_found_is_cached_errors_are_not(self) -> None:
        with patch.object(open_food_facts.httpx, 'get', return_value=_FakeResponse(404)) as get:  # noqa: E501
            self.assertIsNone(open_food_facts.lookup_barcode(NUTELLA_EAN))
            self.assertIsNone(open_food_facts.lookup_barcode(NUTELLA_EAN))
        get.assert_called_once()

    def test_errors_are_non_blocking(self) -> None:
        transient = (
            httpx.ReadTimeout('t'), httpx.ConnectError('c'), _FakeResponse(503),
            _FakeResponse(200, json.JSONDecodeError('x', '', 0)),
        )
        for outcome in transient:
            self.setUp()
            mocked = (
                {'side_effect': outcome} if isinstance(outcome, Exception)
                else {'return_value': outcome}
            )
            with self.subTest(outcome=outcome), \
                    patch.object(open_food_facts.httpx, 'get', **mocked) as get:
                self.assertIsNone(open_food_facts.lookup_barcode(NUTELLA_EAN))
                self.assertIsNone(open_food_facts.lookup_barcode(NUTELLA_EAN))
                self.assertEqual(get.call_count, 2)  # rien mis en cache

    def test_unusable_product_payload(self) -> None:
        for payload in ({'status': 0}, {'status': 1, 'product': 'x'}, [], {'status': 1, 'product': {}}):  # noqa: E501
            self.setUp()
            with self.subTest(payload=payload), patch.object(
                open_food_facts.httpx, 'get', return_value=_FakeResponse(200, payload),
            ):
                self.assertIsNone(open_food_facts.lookup_barcode(NUTELLA_EAN))

    def test_cache_failure_is_non_blocking(self) -> None:
        broken = patch.object(
            open_food_facts.caches['product_lookups'], 'get', side_effect=ConnectionError(),  # noqa: E501
        )
        with broken, patch.object(open_food_facts.httpx, 'get', return_value=self._found()):  # noqa: E501
            product = open_food_facts.lookup_barcode(NUTELLA_EAN)
        self.assertEqual(product.name, 'Nutella')


class VisionQuotaConcurrencyTest(TransactionTestCase):
    """Deux scans simultanés sur le dernier appel du mois : un seul passe."""

    serialized_rollback = True

    def _race(self, shop: Shop) -> list[bool]:
        barrier = threading.Barrier(2)
        results: list[bool] = []
        month = scan_quota_month(shop)

        def worker() -> None:
            try:
                barrier.wait()
                results.append(reserve_vision_scan(Shop.objects.get(pk=shop.pk), month))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        return results

    def test_last_slot(self) -> None:
        _, shop = make_user_shop('race-vision@example.com')
        ProductScanUsageFactory(shop=shop, month=scan_quota_month(shop), vision_count=4)  # noqa: E501
        results = self._race(shop)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(ProductScanUsage.objects.get(shop=shop).vision_count, 5)

    def test_first_scan_of_the_month(self) -> None:
        """Création concurrente de la ligne du mois : ni doublon, ni erreur."""
        SubscriptionPlan.objects.filter(code=SubscriptionPlan.CODE_FREE).update(
            max_vision_scans_per_month=1,
        )
        _, shop = make_user_shop('race-vision-first@example.com')
        results = self._race(shop)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(ProductScanUsage.objects.get(shop=shop).vision_count, 1)


class VisionQuotaTest(TestCase):
    def test_unlimited_plan(self) -> None:
        SubscriptionPlan.objects.filter(code=SubscriptionPlan.CODE_FREE).update(
            max_vision_scans_per_month=None,
        )
        _, shop = make_user_shop('unlimited-vision@example.com')
        month = scan_quota_month(shop)
        ProductScanUsageFactory(shop=shop, month=month, vision_count=10_000)
        self.assertTrue(reserve_vision_scan(shop, month))

    def test_zero_quota_creates_nothing(self) -> None:
        SubscriptionPlan.objects.filter(code=SubscriptionPlan.CODE_FREE).update(
            max_vision_scans_per_month=0,
        )
        _, shop = make_user_shop('no-vision@example.com')
        self.assertFalse(reserve_vision_scan(shop, scan_quota_month(shop)))
        self.assertFalse(ProductScanUsage.objects.exists())

    def test_month_follows_shop_timezone(self) -> None:
        from datetime import datetime, timezone as dt_timezone
        _, shop = make_user_shop('tz-vision@example.com')
        shop.timezone = 'Pacific/Kiritimati'  # UTC+14
        late_utc = datetime(2026, 10, 31, 12, 0, tzinfo=dt_timezone.utc)
        with patch('django.utils.timezone.now', return_value=late_utc):
            self.assertEqual(scan_quota_month(shop).isoformat(), '2026-11-01')
