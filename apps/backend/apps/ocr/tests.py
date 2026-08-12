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


# ═══════════════════════════════════════════════════════════════════════════
# Infrastructure Celery — healthcheck + routage (étape 3)
# ═══════════════════════════════════════════════════════════════════════════


class OcrWorkerHealthcheckTaskTest(TestCase):
    """Contrat de la tâche `ocr_worker_healthcheck` — pas de broker requis."""

    def test_healthcheck_returns_expected_contract(self) -> None:
        from .tasks import ocr_worker_healthcheck

        result = ocr_worker_healthcheck.run()
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['worker'], 'ocr')
        # Date ISO parseable — on n'exige pas de valeur exacte.
        from datetime import datetime
        datetime.fromisoformat(result['checked_at'])

    def test_healthcheck_does_not_touch_business_models(self) -> None:
        from .tasks import ocr_worker_healthcheck

        before_docs = UploadedDocument.objects.count()
        before_ocr = OcrResult.objects.count()
        before_movements = StockMovement.objects.count()
        ocr_worker_healthcheck.run()
        self.assertEqual(UploadedDocument.objects.count(), before_docs)
        self.assertEqual(OcrResult.objects.count(), before_ocr)
        self.assertEqual(StockMovement.objects.count(), before_movements)

    def test_task_registered_under_expected_name(self) -> None:
        from .tasks import ocr_worker_healthcheck

        self.assertEqual(
            ocr_worker_healthcheck.name, 'apps.ocr.tasks.ocr_worker_healthcheck',
        )

    def test_task_routed_to_ocr_queue(self) -> None:
        from django.conf import settings

        self.assertIn('apps.ocr.tasks.*', settings.CELERY_TASK_ROUTES)
        self.assertEqual(
            settings.CELERY_TASK_ROUTES['apps.ocr.tasks.*'],
            {'queue': 'ocr'},
        )


# ═══════════════════════════════════════════════════════════════════════════
# Transitions de statut OcrResult (étape 3)
# ═══════════════════════════════════════════════════════════════════════════


class OcrTransitionsTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.user)

    def _make_ocr(self, status: str = OcrResult.STATUS_PENDING) -> OcrResult:
        return OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document, status=status,
        )

    # ── Chemin nominal ──────────────────────────────────────────────────
    def test_pending_to_processing(self) -> None:
        from .services import mark_ocr_processing

        ocr = self._make_ocr()
        result = mark_ocr_processing(ocr.pk)
        self.assertEqual(result.status, OcrResult.STATUS_PROCESSING)
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_PROCESSING)

    def test_processing_to_done_stores_full_payload(self) -> None:
        from .services import mark_ocr_done

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        payload = {'supplier': 'ACME', 'total': '19.99'}
        result = mark_ocr_done(
            ocr.pk,
            raw_text='Facture ACME 19.99',
            structured_data=payload,
            confidence_score=Decimal('0.912'),
        )
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_DONE)
        self.assertEqual(result.raw_text, 'Facture ACME 19.99')
        self.assertEqual(result.structured_data, payload)
        self.assertEqual(result.confidence_score, Decimal('0.912'))
        self.assertEqual(result.error_message, '')

    def test_processing_to_done_minimum_payload(self) -> None:
        """`structured_data` et `confidence_score` sont optionnels."""
        from .services import mark_ocr_done

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        result = mark_ocr_done(ocr.pk, raw_text='Texte brut')
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_DONE)
        self.assertEqual(result.raw_text, 'Texte brut')
        self.assertIsNone(result.structured_data)
        self.assertIsNone(result.confidence_score)

    def test_processing_to_failed_stores_error(self) -> None:
        from .services import mark_ocr_failed

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        result = mark_ocr_failed(ocr.pk, error_message='Image illisible')
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_FAILED)
        self.assertEqual(result.error_message, 'Image illisible')

    # ── Transitions invalides ───────────────────────────────────────────
    def test_pending_to_done_rejected(self) -> None:
        from .services import InvalidOcrTransitionError, mark_ocr_done

        ocr = self._make_ocr()
        with self.assertRaises(InvalidOcrTransitionError):
            mark_ocr_done(ocr.pk, raw_text='Texte')
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_PENDING)

    def test_pending_to_failed_rejected(self) -> None:
        from .services import InvalidOcrTransitionError, mark_ocr_failed

        ocr = self._make_ocr()
        with self.assertRaises(InvalidOcrTransitionError):
            mark_ocr_failed(ocr.pk, error_message='Nope')
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_PENDING)

    def test_done_to_processing_rejected(self) -> None:
        from .services import InvalidOcrTransitionError, mark_ocr_processing

        ocr = self._make_ocr(status=OcrResult.STATUS_DONE)
        with self.assertRaises(InvalidOcrTransitionError):
            mark_ocr_processing(ocr.pk)
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_DONE)

    def test_failed_to_processing_rejected(self) -> None:
        from .services import InvalidOcrTransitionError, mark_ocr_processing

        ocr = self._make_ocr(status=OcrResult.STATUS_FAILED)
        with self.assertRaises(InvalidOcrTransitionError):
            mark_ocr_processing(ocr.pk)
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_FAILED)

    def test_validated_cannot_be_touched(self) -> None:
        """Un OCR validé humainement est verrouillé pour les tâches auto."""
        from .services import (
            InvalidOcrTransitionError,
            mark_ocr_done,
            mark_ocr_failed,
            mark_ocr_processing,
        )

        ocr = self._make_ocr(status=OcrResult.STATUS_VALIDATED)
        for call in (
            lambda: mark_ocr_processing(ocr.pk),
            lambda: mark_ocr_done(ocr.pk, raw_text='x'),
            lambda: mark_ocr_failed(ocr.pk, error_message='x'),
        ):
            with self.assertRaises(InvalidOcrTransitionError):
                call()
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_VALIDATED)

    # ── Effets secondaires interdits ────────────────────────────────────
    def test_transitions_do_not_create_stock_movement(self) -> None:
        from .services import mark_ocr_done, mark_ocr_failed, mark_ocr_processing

        ocr = self._make_ocr()
        before = StockMovement.objects.count()
        mark_ocr_processing(ocr.pk)
        mark_ocr_done(ocr.pk, raw_text='Texte')
        self.assertEqual(StockMovement.objects.count(), before)

        ocr2 = self._make_ocr()
        mark_ocr_processing(ocr2.pk)
        mark_ocr_failed(ocr2.pk, error_message='ko')
        self.assertEqual(StockMovement.objects.count(), before)

    def test_done_does_not_touch_validation_fields(self) -> None:
        from .services import mark_ocr_done, mark_ocr_processing

        ocr = self._make_ocr()
        mark_ocr_processing(ocr.pk)
        mark_ocr_done(ocr.pk, raw_text='Texte')
        ocr.refresh_from_db()
        self.assertIsNone(ocr.validated_by_user)
        self.assertIsNone(ocr.validated_at)

    def test_failed_clears_previous_error_on_reprocessing_attempt(self) -> None:
        """`mark_ocr_processing` remet `error_message` à vide.

        Utile si un jour on autorise `failed → processing` via une action
        explicite : cette invariance doit rester exacte pour le chemin
        `pending → processing` déjà supporté.
        """
        from .services import mark_ocr_processing

        ocr = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_PENDING,
            error_message='trace précédente',
        )
        result = mark_ocr_processing(ocr.pk)
        self.assertEqual(result.error_message, '')

    def test_shop_is_preserved_across_transitions(self) -> None:
        from .services import mark_ocr_done, mark_ocr_processing

        ocr = self._make_ocr()
        mark_ocr_processing(ocr.pk)
        mark_ocr_done(ocr.pk, raw_text='Texte')
        ocr.refresh_from_db()
        self.assertEqual(ocr.shop, self.shop)
        self.assertEqual(ocr.uploaded_document, self.document)

    # ── Validation du score de confiance ────────────────────────────────
    def test_confidence_score_zero_accepted(self) -> None:
        from .services import mark_ocr_done

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        result = mark_ocr_done(
            ocr.pk, raw_text='Texte', confidence_score=Decimal('0.000'),
        )
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_DONE)
        self.assertEqual(result.confidence_score, Decimal('0.000'))

    def test_confidence_score_one_accepted(self) -> None:
        from .services import mark_ocr_done

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        result = mark_ocr_done(
            ocr.pk, raw_text='Texte', confidence_score=Decimal('1.000'),
        )
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_DONE)
        self.assertEqual(result.confidence_score, Decimal('1.000'))

    def test_confidence_score_below_zero_rejected(self) -> None:
        from .services import InvalidConfidenceScoreError, mark_ocr_done

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        with self.assertRaises(InvalidConfidenceScoreError):
            mark_ocr_done(
                ocr.pk, raw_text='Texte', confidence_score=Decimal('-0.001'),
            )
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_PROCESSING)
        self.assertIsNone(ocr.confidence_score)
        self.assertEqual(ocr.raw_text, '')

    def test_confidence_score_above_one_rejected(self) -> None:
        from .services import InvalidConfidenceScoreError, mark_ocr_done

        ocr = self._make_ocr(status=OcrResult.STATUS_PROCESSING)
        with self.assertRaises(InvalidConfidenceScoreError):
            mark_ocr_done(
                ocr.pk, raw_text='Texte', confidence_score=Decimal('1.001'),
            )
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_PROCESSING)
        self.assertIsNone(ocr.confidence_score)
        self.assertEqual(ocr.raw_text, '')

    # ── Concurrence : deuxième transition perd la course ────────────────
    def test_concurrent_processing_transition_rejects_second_caller(self) -> None:
        """Simulation : deux workers lisent l'état, un seul commit.

        On ne peut pas déclencher un vrai `select_for_update` verrou sans
        threads + Postgres réel dans le test. On modélise le scénario en
        appelant deux fois `mark_ocr_processing` : le second appel doit
        échouer parce que le statut a déjà changé.
        """
        from .services import InvalidOcrTransitionError, mark_ocr_processing

        ocr = self._make_ocr()
        mark_ocr_processing(ocr.pk)
        with self.assertRaises(InvalidOcrTransitionError):
            mark_ocr_processing(ocr.pk)


# ═══════════════════════════════════════════════════════════════════════════
# Client HTTP vers le service IA FastAPI (étape 4)
# ═══════════════════════════════════════════════════════════════════════════
#
# On mocke `urllib.request.urlopen` pour ne dépendre d'aucun vrai conteneur
# FastAPI dans la suite unitaire. Les tests réseau réels sont documentés
# dans le rapport (curl host + backend->ai-service via manage.py shell).


import io
import json as _json
import logging as _logging
import socket as _socket
import urllib.error as _urllib_error

from django.test import SimpleTestCase


_TEST_AI_KEY = 'test-internal-ai-key-not-real'


def _http_response(payload: dict, *, status_code: int = 200) -> object:
    """Mini réponse compatible avec le context manager d'`urlopen`."""

    class _Resp:
        status = status_code

        def __enter__(self_inner) -> object:
            return self_inner

        def __exit__(self_inner, *_exc) -> bool:
            return False

        def read(self_inner) -> bytes:
            return _json.dumps(payload).encode('utf-8')

    return _Resp()


def _http_response_raw(raw: bytes, *, status_code: int = 200) -> object:
    class _Resp:
        status = status_code

        def __enter__(self_inner) -> object:
            return self_inner

        def __exit__(self_inner, *_exc) -> bool:
            return False

        def read(self_inner) -> bytes:
            return raw

    return _Resp()


@override_settings(
    AI_SERVICE_URL='http://ai-service:8000',
    AI_SERVICE_API_KEY=_TEST_AI_KEY,
    AI_SERVICE_TIMEOUT_SECONDS=1.0,
)
class AiClientHealthTest(SimpleTestCase):
    """Cas nominaux : /health public et /internal/health authentifié."""

    def test_health_ok_returns_typed_result(self) -> None:
        from .ai_client import check_ai_service_health

        with patch('apps.ocr.ai_client.urllib.request.urlopen') as mock_open:
            mock_open.return_value = _http_response(
                {'status': 'ok', 'service': 'mizan-ai'},
            )
            result = check_ai_service_health()

        self.assertEqual(result.status, 'ok')
        self.assertEqual(result.service, 'mizan-ai')
        self.assertFalse(result.authenticated)

    def test_health_url_and_headers(self) -> None:
        from .ai_client import check_ai_service_health

        with patch('apps.ocr.ai_client.urllib.request.urlopen') as mock_open:
            mock_open.return_value = _http_response(
                {'status': 'ok', 'service': 'mizan-ai'},
            )
            check_ai_service_health()

        request = mock_open.call_args.args[0]
        self.assertEqual(request.full_url, 'http://ai-service:8000/health')
        # Aucun header d'auth ne doit fuiter sur l'endpoint public.
        self.assertNotIn('X-internal-api-key', {k.lower(): v for k, v in request.header_items()})

    def test_authenticated_health_sends_expected_header(self) -> None:
        from .ai_client import check_ai_service_authenticated_health

        with patch('apps.ocr.ai_client.urllib.request.urlopen') as mock_open:
            mock_open.return_value = _http_response(
                {'status': 'ok', 'service': 'mizan-ai', 'authenticated': True},
            )
            result = check_ai_service_authenticated_health()

        request = mock_open.call_args.args[0]
        self.assertEqual(
            request.full_url, 'http://ai-service:8000/internal/health',
        )
        # urllib stocke les headers avec une casse normalisée.
        self.assertEqual(request.get_header('X-internal-api-key'), _TEST_AI_KEY)
        self.assertTrue(result.authenticated)
        self.assertEqual(result.status, 'ok')

    def test_url_join_handles_base_without_trailing_slash(self) -> None:
        from .ai_client import check_ai_service_health

        with (
            override_settings(AI_SERVICE_URL='http://ai-service:8000'),
            patch('apps.ocr.ai_client.urllib.request.urlopen') as mock_open,
        ):
            mock_open.return_value = _http_response(
                {'status': 'ok', 'service': 'mizan-ai'},
            )
            check_ai_service_health()

        request = mock_open.call_args.args[0]
        self.assertEqual(request.full_url, 'http://ai-service:8000/health')


@override_settings(
    AI_SERVICE_URL='http://ai-service:8000',
    AI_SERVICE_API_KEY=_TEST_AI_KEY,
    AI_SERVICE_TIMEOUT_SECONDS=0.5,
)
class AiClientErrorHandlingTest(SimpleTestCase):
    """Toute erreur doit produire `AiServiceUnavailableError`, sans fuite."""

    def test_timeout_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, check_ai_service_health

        with patch(
            'apps.ocr.ai_client.urllib.request.urlopen',
            side_effect=_socket.timeout('too slow'),
        ):
            with self.assertRaises(AiServiceUnavailableError):
                check_ai_service_health()

    def test_connection_refused_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, check_ai_service_health

        with patch(
            'apps.ocr.ai_client.urllib.request.urlopen',
            side_effect=_urllib_error.URLError('Connection refused'),
        ):
            with self.assertRaises(AiServiceUnavailableError):
                check_ai_service_health()

    def test_http_500_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, check_ai_service_health

        http_error = _urllib_error.HTTPError(
            url='http://ai-service:8000/health',
            code=500,
            msg='Internal Server Error',
            hdrs=None,
            fp=io.BytesIO(b'oops'),
        )
        with patch(
            'apps.ocr.ai_client.urllib.request.urlopen', side_effect=http_error,
        ):
            with self.assertRaises(AiServiceUnavailableError):
                check_ai_service_health()

    def test_invalid_json_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, check_ai_service_health

        with patch('apps.ocr.ai_client.urllib.request.urlopen') as mock_open:
            mock_open.return_value = _http_response_raw(b'<html>oops</html>')
            with self.assertRaises(AiServiceUnavailableError):
                check_ai_service_health()

    def test_non_dict_json_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, check_ai_service_health

        with patch('apps.ocr.ai_client.urllib.request.urlopen') as mock_open:
            mock_open.return_value = _http_response_raw(b'[1, 2, 3]')
            with self.assertRaises(AiServiceUnavailableError):
                check_ai_service_health()

    def test_error_message_never_contains_api_key(self) -> None:
        """Ni les messages d'exception ni les logs ne doivent contenir la clé."""
        from .ai_client import (
            AiServiceUnavailableError,
            check_ai_service_authenticated_health,
        )

        with self.assertLogs('apps.ocr.ai_client', level=_logging.WARNING) as logs:
            with patch(
                'apps.ocr.ai_client.urllib.request.urlopen',
                side_effect=_urllib_error.URLError('Connection refused'),
            ):
                try:
                    check_ai_service_authenticated_health()
                except AiServiceUnavailableError as exc:
                    exception_message = str(exc)
                    cause_message = str(exc.__cause__) if exc.__cause__ else ''

        self.assertNotIn(_TEST_AI_KEY, exception_message)
        self.assertNotIn(_TEST_AI_KEY, cause_message)
        for entry in logs.output:
            self.assertNotIn(_TEST_AI_KEY, entry)
