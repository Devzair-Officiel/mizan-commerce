from decimal import Decimal
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.stock.models import StockMovement

from .models import OcrResult, UploadedDocument


# ─── Payloads binaires valides pour la validation de signature ─────────────
# JPEG minimal : SOI + APP0 + EOI. Suffisant pour matcher \xff\xd8\xff.
JPEG_BYTES = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
    b'\xff\xd9'
)
# PNG : signature 8 octets + IHDR minimal (contenu bidon accepté par notre check).
PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16
# WebP : RIFF....WEBP + payload bidon.
WEBP_BYTES = b'RIFF\x00\x00\x00\x00WEBP' + b'\x00' * 8


def make_user_shop(email: str) -> tuple[User, Shop]:
    user = User.objects.create_user(email=email, password='Pass123!Strong')
    shop = Shop.objects.create(name=f'Shop {email}')
    ShopMember.objects.create(shop=shop, user=user, role='owner')
    return user, shop


def make_document(shop: Shop, user: User | None = None) -> UploadedDocument:
    return UploadedDocument.objects.create(
        shop=shop,
        uploaded_by_user=user,
        document_type=UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE,
        object_key=f'shops/{shop.pk}/ocr/facture.jpg',
        original_filename='facture.jpg',
        mime_type='image/jpeg',
        size_bytes=123_456,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Modèles (étape 1)
# ═══════════════════════════════════════════════════════════════════════════


class UploadedDocumentModelTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')

    def test_create_uploaded_document(self) -> None:
        doc = make_document(self.shop, self.user)
        self.assertEqual(UploadedDocument.objects.filter(shop=self.shop).count(), 1)
        self.assertEqual(doc.shop, self.shop)
        self.assertEqual(doc.uploaded_by_user, self.user)
        self.assertEqual(doc.document_type, 'supplier_invoice')
        self.assertEqual(doc.size_bytes, 123_456)
        self.assertIsNotNone(doc.created_at)

    def test_uploaded_by_user_nullable(self) -> None:
        doc = UploadedDocument.objects.create(
            shop=self.shop,
            document_type=UploadedDocument.DOCUMENT_TYPE_OTHER,
            object_key='shops/x/other.pdf',
        )
        self.assertIsNone(doc.uploaded_by_user)


class OcrResultModelTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.user)

    def test_create_ocr_result(self) -> None:
        result = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
        )
        self.assertEqual(result.shop, self.shop)
        self.assertEqual(result.uploaded_document, self.document)

    def test_default_status_is_pending(self) -> None:
        result = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
        )
        self.assertEqual(result.status, OcrResult.STATUS_PENDING)

    def test_structured_data_json_preserved(self) -> None:
        payload = {
            'supplier': 'ACME',
            'lines': [
                {'label': 'Article A', 'quantity': 2, 'unit_price': '3.50'},
                {'label': 'Article B', 'quantity': 1, 'unit_price': '9.99'},
            ],
            'total': '16.99',
        }
        result = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            structured_data=payload,
        )
        result.refresh_from_db()
        self.assertEqual(result.structured_data, payload)

    def test_confidence_score_valid_range(self) -> None:
        for score in (Decimal('0.000'), Decimal('0.500'), Decimal('1.000')):
            result = OcrResult(
                shop=self.shop,
                uploaded_document=self.document,
                confidence_score=score,
            )
            result.full_clean()

    def test_confidence_score_below_zero_rejected(self) -> None:
        result = OcrResult(
            shop=self.shop,
            uploaded_document=self.document,
            confidence_score=Decimal('-0.001'),
        )
        with self.assertRaises(ValidationError):
            result.full_clean()

    def test_confidence_score_above_one_rejected(self) -> None:
        result = OcrResult(
            shop=self.shop,
            uploaded_document=self.document,
            confidence_score=Decimal('1.001'),
        )
        with self.assertRaises(ValidationError):
            result.full_clean()

    def test_relations_shop_document_result(self) -> None:
        result = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_DONE,
            raw_text='Facture ACME',
            validated_by_user=self.user,
            validated_at=timezone.now(),
        )
        self.assertIn(result, self.document.ocr_results.all())
        self.assertIn(result, self.shop.ocr_results.all())
        self.assertIn(self.document, self.shop.uploaded_documents.all())
        self.assertIn(result, self.user.validated_ocr_results.all())


# ═══════════════════════════════════════════════════════════════════════════
# Endpoint POST /api/ocr/invoices/ (étape 2)
# ═══════════════════════════════════════════════════════════════════════════


@override_settings(
    # Force is_storage_configured() -> True sans avoir besoin de patcher.
    AWS_S3_ENDPOINT_URL='https://s3.example.com',
    AWS_ACCESS_KEY_ID='fake-access-key',
)
class SupplierInvoiceUploadViewTest(TestCase):
    """Tests API — patch systématique de upload_fileobj pour éviter tout S3."""

    URL = '/api/ocr/invoices/'

    def setUp(self) -> None:
        self.client = APIClient()
        self.owner, self.shop = make_user_shop('owner@example.com')

    def _jpeg(self, name: str = 'facture.jpg') -> SimpleUploadedFile:
        return SimpleUploadedFile(name, JPEG_BYTES, content_type='image/jpeg')

    def _png(self, name: str = 'facture.png') -> SimpleUploadedFile:
        return SimpleUploadedFile(name, PNG_BYTES, content_type='image/png')

    def _webp(self, name: str = 'facture.webp') -> SimpleUploadedFile:
        return SimpleUploadedFile(name, WEBP_BYTES, content_type='image/webp')

    # ── URL / routing ───────────────────────────────────────────────────
    def test_url_reverse(self) -> None:
        self.assertEqual(reverse('ocr-invoice-upload'), self.URL)

    # ── Permissions ─────────────────────────────────────────────────────
    def test_unauthenticated_denied(self) -> None:
        response = self.client.post(self.URL, {'document': self._jpeg()}, format='multipart')
        # JWTAuthentication expose un WWW-Authenticate → DRF renvoie 401.
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_owner_can_upload(self) -> None:
        self.client.force_authenticate(user=self.owner)
        with patch('apps.ocr.services.upload_fileobj') as mock_upload:
            response = self.client.post(
                self.URL, {'document': self._jpeg()}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        mock_upload.assert_called_once()

    def test_staff_with_stock_module_can_upload(self) -> None:
        staff = User.objects.create_user(email='staff-stock@example.com', password='Pass123!Strong')
        ShopMember.objects.create(
            shop=self.shop, user=staff, role='staff', permissions=['stock'],
        )
        self.client.force_authenticate(user=staff)
        with patch('apps.ocr.services.upload_fileobj'):
            response = self.client.post(
                self.URL, {'document': self._jpeg()}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

    def test_staff_without_stock_module_denied(self) -> None:
        staff = User.objects.create_user(email='staff-nostock@example.com', password='Pass123!Strong')
        ShopMember.objects.create(
            shop=self.shop, user=staff, role='staff', permissions=['products', 'orders'],
        )
        self.client.force_authenticate(user=staff)
        with patch('apps.ocr.services.upload_fileobj') as mock_upload:
            response = self.client.post(
                self.URL, {'document': self._jpeg()}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        mock_upload.assert_not_called()

    # ── Validation d'entrée ─────────────────────────────────────────────
    def test_missing_document_returns_400(self) -> None:
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.URL, {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Le handler global enveloppe : {"detail": "...", "errors": {"document": [...]}}
        self.assertIn('document', response.data.get('errors', {}))

    def test_disallowed_mime_returns_400(self) -> None:
        self.client.force_authenticate(user=self.owner)
        # Contenu PDF-like avec content_type PDF → refusé par la liste blanche.
        pdf = SimpleUploadedFile(
            'facture.pdf', b'%PDF-1.4 fake', content_type='application/pdf',
        )
        with patch('apps.ocr.services.upload_fileobj') as mock_upload:
            response = self.client.post(self.URL, {'document': pdf}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mock_upload.assert_not_called()

    def test_too_large_returns_400(self) -> None:
        self.client.force_authenticate(user=self.owner)
        oversized = SimpleUploadedFile(
            'facture.jpg',
            JPEG_BYTES + b'\x00' * (10 * 1024 * 1024 + 1),
            content_type='image/jpeg',
        )
        with patch('apps.ocr.services.upload_fileobj') as mock_upload:
            response = self.client.post(
                self.URL, {'document': oversized}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mock_upload.assert_not_called()

    def test_signature_mismatch_returns_400(self) -> None:
        """MIME image/jpeg annoncé mais le binaire est un PDF."""
        self.client.force_authenticate(user=self.owner)
        fake = SimpleUploadedFile(
            'facture.jpg', b'%PDF-1.4 fake', content_type='image/jpeg',
        )
        with patch('apps.ocr.services.upload_fileobj') as mock_upload:
            response = self.client.post(self.URL, {'document': fake}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mock_upload.assert_not_called()

    def test_png_and_webp_accepted(self) -> None:
        self.client.force_authenticate(user=self.owner)
        for factory in (self._png, self._webp):
            with patch('apps.ocr.services.upload_fileobj'):
                response = self.client.post(
                    self.URL, {'document': factory()}, format='multipart',
                )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

    # ── Storage non configuré ───────────────────────────────────────────
    @override_settings(AWS_S3_ENDPOINT_URL='', AWS_ACCESS_KEY_ID='')
    def test_storage_not_configured_returns_503(self) -> None:
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            self.URL, {'document': self._jpeg()}, format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    # ── Comportement métier ─────────────────────────────────────────────
    def test_successful_upload_creates_document_and_ocr(self) -> None:
        self.client.force_authenticate(user=self.owner)
        with patch('apps.ocr.services.upload_fileobj') as mock_upload:
            response = self.client.post(
                self.URL, {'document': self._jpeg('ma-facture.jpg')}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        doc = UploadedDocument.objects.get(pk=response.data['document_id'])
        ocr = OcrResult.objects.get(pk=response.data['ocr_result_id'])

        self.assertEqual(doc.shop, self.shop)
        self.assertEqual(doc.uploaded_by_user, self.owner)
        self.assertEqual(doc.document_type, UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE)
        self.assertEqual(doc.original_filename, 'ma-facture.jpg')
        self.assertEqual(doc.mime_type, 'image/jpeg')
        self.assertEqual(doc.size_bytes, len(JPEG_BYTES))

        self.assertEqual(ocr.shop, self.shop)
        self.assertEqual(ocr.uploaded_document, doc)
        self.assertEqual(ocr.status, OcrResult.STATUS_PENDING)

        # object_key transmis à upload_fileobj est bien scopé au shop.
        args, _ = mock_upload.call_args
        self.assertEqual(args[1], doc.object_key)
        self.assertTrue(doc.object_key.startswith(f'ocr/{self.shop.pk}/supplier-invoices/'))
        self.assertTrue(doc.object_key.endswith('.jpg'))

    def test_response_does_not_leak_object_key(self) -> None:
        self.client.force_authenticate(user=self.owner)
        with patch('apps.ocr.services.upload_fileobj'):
            response = self.client.post(
                self.URL, {'document': self._jpeg()}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('object_key', response.data)
        self.assertNotIn('url', response.data)

    def test_no_stock_movement_created(self) -> None:
        self.client.force_authenticate(user=self.owner)
        before = StockMovement.objects.count()
        with patch('apps.ocr.services.upload_fileobj'):
            self.client.post(self.URL, {'document': self._jpeg()}, format='multipart')
        self.assertEqual(StockMovement.objects.count(), before)

    def test_shop_id_from_client_is_ignored(self) -> None:
        """Un shop_id envoyé par le client ne doit jamais dévier la boutique cible."""
        _other_user, other_shop = make_user_shop('other@example.com')
        self.client.force_authenticate(user=self.owner)
        with patch('apps.ocr.services.upload_fileobj'):
            response = self.client.post(
                self.URL,
                {'document': self._jpeg(), 'shop_id': str(other_shop.pk)},
                format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        doc = UploadedDocument.objects.get(pk=response.data['document_id'])
        self.assertEqual(doc.shop, self.shop)
        self.assertNotEqual(doc.shop, other_shop)


# ═══════════════════════════════════════════════════════════════════════════
# Service : compensation S3 en cas d'échec DB
# ═══════════════════════════════════════════════════════════════════════════


@override_settings(
    AWS_S3_ENDPOINT_URL='https://s3.example.com',
    AWS_ACCESS_KEY_ID='fake-access-key',
)
class SupplierInvoiceServiceCompensationTest(TestCase):
    def test_db_failure_triggers_object_deletion(self) -> None:
        from .services import create_supplier_invoice_upload

        user, shop = make_user_shop('owner@example.com')
        file = SimpleUploadedFile('facture.jpg', JPEG_BYTES, content_type='image/jpeg')

        with (
            patch('apps.ocr.services.upload_fileobj') as mock_upload,
            patch('apps.ocr.services.delete_object') as mock_delete,
            patch(
                'apps.ocr.services.UploadedDocument.objects.create',
                side_effect=RuntimeError('DB down'),
            ),
        ):
            with self.assertRaises(RuntimeError):
                create_supplier_invoice_upload(shop=shop, user=user, file=file)

        mock_upload.assert_called_once()
        mock_delete.assert_called_once()
        # La clé compensée doit être celle qui a été uploadée.
        uploaded_key = mock_upload.call_args[0][1]
        deleted_key = mock_delete.call_args[0][0]
        self.assertEqual(uploaded_key, deleted_key)
        self.assertEqual(UploadedDocument.objects.count(), 0)
        self.assertEqual(OcrResult.objects.count(), 0)
