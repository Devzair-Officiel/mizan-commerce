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
from apps.products.models import Product, ProductVariant
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
    """Tests API — patch systématique de upload_fileobj pour éviter tout S3
    et de `process_invoice_ocr.delay` pour ne rien envoyer au broker."""

    URL = '/api/ocr/invoices/'

    def setUp(self) -> None:
        self.client = APIClient()
        self.owner, self.shop = make_user_shop('owner@example.com')
        # Patch centralisé : chaque test hérite d'un `.delay()` neutralisé.
        # Les cas qui veulent auditer les appels utilisent `self.mock_delay`.
        self.mock_delay = self.enterContext(
            patch('apps.ocr.views.process_invoice_ocr.delay'),
        )

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
            ),self.assertRaises(RuntimeError)
        ):
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
            side_effect=TimeoutError('too slow'),
        ), self.assertRaises(AiServiceUnavailableError):
            check_ai_service_health()

    def test_connection_refused_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, check_ai_service_health

        with patch(
            'apps.ocr.ai_client.urllib.request.urlopen',
            side_effect=_urllib_error.URLError('Connection refused'),
        ), self.assertRaises(AiServiceUnavailableError):
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
        ), self.assertRaises(AiServiceUnavailableError):
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


# ═══════════════════════════════════════════════════════════════════════════
# extract_text_with_ai_service — POST multipart typé (étape 5B)
# ═══════════════════════════════════════════════════════════════════════════
#
# On patche `httpx.post` : la surface HTTP est déjà couverte par les tests
# d'intégration réels côté ai-service ; ici on ne vérifie que le contrat
# (URL, headers, timeout, parsing, erreurs).


import httpx as _httpx


class _FakeHttpxResponse:
    """Simulation minimale d'une `httpx.Response` pour les tests."""

    def __init__(self, *, status_code: int = 200, payload: object | None = None, raw: bytes | None = None) -> None:
        self.status_code = status_code
        self._payload = payload
        self._raw = raw

    def json(self) -> object:
        if self._raw is not None:
            return _json.loads(self._raw.decode('utf-8'))
        return self._payload


@override_settings(
    AI_SERVICE_URL='http://ai-service:8000',
    AI_SERVICE_API_KEY=_TEST_AI_KEY,
    AI_SERVICE_OCR_TIMEOUT_SECONDS=42.0,
)
class ExtractTextWithAiServiceTest(SimpleTestCase):
    def _valid_payload(self) -> dict:
        return {
            'raw_text': 'ligne 1\nligne 2',
            'confidence_score': 0.912,
            'lines': [
                {'text': 'ligne 1', 'confidence': 0.94, 'bbox': [1, 2, 3, 4]},
                {'text': 'ligne 2', 'confidence': 0.88, 'bbox': []},
            ],
        }

    def test_nominal_returns_typed_extraction(self) -> None:
        from .ai_client import extract_text_with_ai_service

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=self._valid_payload())
            result = extract_text_with_ai_service(
                content=b'\xff\xd8\xff...bytes...',
                filename='facture.jpg',
                mime_type='image/jpeg',
            )
        self.assertEqual(result.raw_text, 'ligne 1\nligne 2')
        self.assertAlmostEqual(result.confidence_score, 0.912)
        self.assertEqual(len(result.lines), 2)
        self.assertEqual(result.lines[0].text, 'ligne 1')
        self.assertEqual(result.lines[0].bbox, [1, 2, 3, 4])
        self.assertEqual(result.lines[1].bbox, [])

    def test_uses_expected_url_headers_timeout(self) -> None:
        from .ai_client import INTERNAL_API_KEY_HEADER, extract_text_with_ai_service

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=self._valid_payload())
            extract_text_with_ai_service(
                content=b'\xff\xd8\xff', filename='f.jpg', mime_type='image/jpeg',
            )

        kwargs = mock_post.call_args.kwargs
        self.assertEqual(mock_post.call_args.args[0], 'http://ai-service:8000/internal/ocr/extract-text')
        self.assertEqual(kwargs['headers'], {INTERNAL_API_KEY_HEADER: _TEST_AI_KEY})
        self.assertEqual(kwargs['timeout'], 42.0)
        # Contenu envoyé sous forme `files={'document': (name, bytes, mime)}`.
        files = kwargs['files']
        self.assertIn('document', files)
        name, payload, mime = files['document']
        self.assertEqual(name, 'f.jpg')
        self.assertEqual(payload, b'\xff\xd8\xff')
        self.assertEqual(mime, 'image/jpeg')

    def test_timeout_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, extract_text_with_ai_service

        with patch(
            'apps.ocr.ai_client.httpx.post',
            side_effect=_httpx.ReadTimeout('too slow'),
        ), self.assertRaises(AiServiceUnavailableError):
            extract_text_with_ai_service(
                content=b'x', filename='x.jpg', mime_type='image/jpeg',
            )

    def test_http_500_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, extract_text_with_ai_service

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(status_code=500, payload={'detail': 'boom'})
            with self.assertRaises(AiServiceUnavailableError):
                extract_text_with_ai_service(
                    content=b'x', filename='x.jpg', mime_type='image/jpeg',
                )

    def test_http_400_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, extract_text_with_ai_service

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(status_code=400, payload={'detail': 'bad'})
            with self.assertRaises(AiServiceUnavailableError):
                extract_text_with_ai_service(
                    content=b'x', filename='x.jpg', mime_type='image/jpeg',
                )

    def test_invalid_payload_raises_domain_error(self) -> None:
        from .ai_client import AiServiceUnavailableError, extract_text_with_ai_service

        for bad in ({'raw_text': None}, {'raw_text': 'x', 'confidence_score': 2.5, 'lines': []},
                    {'raw_text': 'x', 'confidence_score': 0.5, 'lines': [{'text': 'a'}]}):
            with patch('apps.ocr.ai_client.httpx.post') as mock_post:
                mock_post.return_value = _FakeHttpxResponse(payload=bad)
                with self.assertRaises(AiServiceUnavailableError):
                    extract_text_with_ai_service(
                        content=b'x', filename='x.jpg', mime_type='image/jpeg',
                    )

    def test_never_leaks_api_key(self) -> None:
        from .ai_client import AiServiceUnavailableError, extract_text_with_ai_service

        with self.assertLogs('apps.ocr.ai_client', level=_logging.WARNING) as logs:
            with patch(
                'apps.ocr.ai_client.httpx.post',
                side_effect=_httpx.ConnectError('refused'),
            ):
                try:
                    extract_text_with_ai_service(
                        content=b'x', filename='x.jpg', mime_type='image/jpeg',
                    )
                except AiServiceUnavailableError as exc:
                    self.assertNotIn(_TEST_AI_KEY, str(exc))
                    if exc.__cause__ is not None:
                        self.assertNotIn(_TEST_AI_KEY, str(exc.__cause__))
        for entry in logs.output:
            self.assertNotIn(_TEST_AI_KEY, entry)


# ═══════════════════════════════════════════════════════════════════════════
# Tâche Celery process_invoice_ocr (étape 5B)
# ═══════════════════════════════════════════════════════════════════════════


class _FakeExtraction:
    """Objet-double compatible avec `AiOcrExtraction` (NamedTuple)."""

    def __init__(self, raw_text: str = 'texte', confidence_score: float = 0.9, lines: list | None = None) -> None:
        self.raw_text = raw_text
        self.confidence_score = confidence_score
        self.lines = lines if lines is not None else []


class _FakeExtractionLine:
    def __init__(self, text: str, confidence: float, bbox: list[int]) -> None:
        self.text = text
        self.confidence = confidence
        self.bbox = bbox


def _fake_extraction() -> _FakeExtraction:
    return _FakeExtraction(
        raw_text='ligne 1\nligne 2',
        confidence_score=0.912,
        lines=[
            _FakeExtractionLine('ligne 1', 0.94, [1, 2, 3, 4]),
            _FakeExtractionLine('ligne 2', 0.88, []),
        ],
    )


def _fake_invoice() -> object:
    """AiInvoiceExtraction canonique — utilisé pour patcher la structuration.

    Retourne un vrai `AiInvoiceExtraction` (NamedTuple) pour rester fidèle au
    contrat typé : la tâche traite ces Decimal / date exactement comme un
    résultat réel du service IA.
    """
    from datetime import date as _date

    from .ai_client import AiInvoiceExtraction, AiInvoiceLine

    return AiInvoiceExtraction(
        supplier_name='ACME',
        invoice_number='INV-001',
        invoice_date=_date(2026, 1, 15),
        currency='EUR',
        subtotal=Decimal('100.00'),
        tax_amount=Decimal('20.00'),
        total=Decimal('120.00'),
        lines=[
            AiInvoiceLine(
                description='Article A',
                supplier_reference='SKU-A',
                quantity=Decimal(2),
                unit_price=Decimal('50.00'),
                line_total=Decimal('100.00'),
                source_line_indices=[0, 1],
            ),
        ],
        warnings=[],
    )


class ProcessInvoiceOcrTaskTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.user)
        self.ocr = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
        )

    def _run(self) -> str:
        from .tasks import process_invoice_ocr
        return process_invoice_ocr.run(str(self.ocr.pk))

    def test_nominal_end_to_end(self) -> None:
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'\xff\xd8\xff...') as mock_download,
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                return_value=_fake_extraction(),
            ) as mock_extract,
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                return_value=_fake_invoice(),
            ) as mock_structure,
        ):
            outcome = self._run()

        self.assertEqual(outcome, 'done')
        mock_download.assert_called_once_with(self.document.object_key)
        # Bytes + filename + mime doivent être transmis fidèlement.
        kwargs = mock_extract.call_args.kwargs
        self.assertEqual(kwargs['content'], b'\xff\xd8\xff...')
        self.assertEqual(kwargs['mime_type'], self.document.mime_type)

        # La structuration reçoit le texte OCR + les lignes typées.
        structure_kwargs = mock_structure.call_args.kwargs
        self.assertEqual(structure_kwargs['raw_text'], 'ligne 1\nligne 2')
        self.assertEqual(len(structure_kwargs['lines']), 2)

        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_DONE)
        self.assertEqual(self.ocr.raw_text, 'ligne 1\nligne 2')
        self.assertEqual(self.ocr.confidence_score, Decimal('0.912'))
        # Les deux namespaces coexistent : `ocr` (brut PaddleOCR) et
        # `invoice` (structure LLM validée déterministiquement).
        self.assertIn('ocr', self.ocr.structured_data)
        self.assertIn('invoice', self.ocr.structured_data)
        lines = self.ocr.structured_data['ocr']['lines']
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0], {'text': 'ligne 1', 'confidence': 0.94, 'bbox': [1, 2, 3, 4]})
        self.assertEqual(lines[1], {'text': 'ligne 2', 'confidence': 0.88, 'bbox': []})

        invoice = self.ocr.structured_data['invoice']
        self.assertEqual(invoice['supplier_name'], 'ACME')
        self.assertEqual(invoice['invoice_number'], 'INV-001')
        self.assertEqual(invoice['invoice_date'], '2026-01-15')
        self.assertEqual(invoice['currency'], 'EUR')
        # Decimals sérialisés en str → aucune perte de précision.
        self.assertEqual(invoice['total'], '120.00')
        self.assertEqual(invoice['subtotal'], '100.00')
        self.assertEqual(invoice['tax_amount'], '20.00')
        self.assertEqual(len(invoice['lines']), 1)
        self.assertEqual(invoice['lines'][0]['description'], 'Article A')
        self.assertEqual(invoice['lines'][0]['line_total'], '100.00')
        self.assertEqual(invoice['lines'][0]['source_line_indices'], [0, 1])
        self.assertEqual(invoice['warnings'], [])
        self.assertEqual(self.ocr.error_message, '')

    def test_missing_ocr_result_returns_not_found_without_raising(self) -> None:
        import uuid as _uuid

        from .tasks import process_invoice_ocr

        outcome = process_invoice_ocr.run(str(_uuid.uuid4()))
        self.assertEqual(outcome, 'not_found')

    def test_already_processing_is_skipped(self) -> None:
        from .services import mark_ocr_processing
        mark_ocr_processing(self.ocr.pk)

        outcome = self._run()
        self.assertEqual(outcome, 'skipped')
        self.ocr.refresh_from_db()
        # Statut inchangé (le second worker n'écrase rien).
        self.assertEqual(self.ocr.status, OcrResult.STATUS_PROCESSING)

    def test_storage_failure_marks_failed(self) -> None:
        with patch('apps.ocr.tasks.download_bytes', side_effect=RuntimeError('S3 down')):
            outcome = self._run()

        self.assertEqual(outcome, 'failed_storage')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_FAILED)
        self.assertIn('échoué', self.ocr.error_message.lower())
        # Ne fuit ni chemin S3 ni détail technique.
        self.assertNotIn('S3', self.ocr.error_message)
        self.assertNotIn(self.document.object_key, self.ocr.error_message)

    def test_ai_service_failure_marks_failed(self) -> None:
        from .ai_client import AiServiceUnavailableError

        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'x'),
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                side_effect=AiServiceUnavailableError('boom interne'),
            ),
        ):
            outcome = self._run()

        self.assertEqual(outcome, 'failed_ai_service')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_FAILED)
        # Le message d'erreur exposé est générique, pas la cause.
        self.assertNotIn('boom', self.ocr.error_message)

    def test_unexpected_exception_marks_failed(self) -> None:
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'x'),
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                side_effect=TypeError('unexpected'),
            ),
        ):
            outcome = self._run()

        self.assertEqual(outcome, 'failed_unexpected')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_FAILED)

    def test_confidence_score_quantized_to_three_decimals(self) -> None:
        extraction = _FakeExtraction(
            raw_text='x', confidence_score=0.123456789, lines=[],
        )
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'x'),
            patch('apps.ocr.tasks.extract_text_with_ai_service', return_value=extraction),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                return_value=_fake_invoice(),
            ),
        ):
            self._run()

        self.ocr.refresh_from_db()
        # ROUND_HALF_UP à la 3e décimale.
        self.assertEqual(self.ocr.confidence_score, Decimal('0.123'))

    def test_out_of_range_confidence_is_clamped(self) -> None:
        extraction = _FakeExtraction(raw_text='x', confidence_score=1.4, lines=[])
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'x'),
            patch('apps.ocr.tasks.extract_text_with_ai_service', return_value=extraction),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                return_value=_fake_invoice(),
            ),
        ):
            outcome = self._run()

        # Le clamping évite `InvalidConfidenceScoreError` → done.
        self.assertEqual(outcome, 'done')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.confidence_score, Decimal('1.000'))

    def test_no_stock_movement_created(self) -> None:
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'x'),
            patch('apps.ocr.tasks.extract_text_with_ai_service', return_value=_fake_extraction()),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                return_value=_fake_invoice(),
            ),
        ):
            before = StockMovement.objects.count()
            self._run()
        self.assertEqual(StockMovement.objects.count(), before)

    def test_tenant_mismatch_refuses_processing(self) -> None:
        """OcrResult pointant sur un document d'un autre tenant : refus strict.

        Le worker ne doit JAMAIS lire un document d'une autre boutique, même
        si un OcrResult et un UploadedDocument avec `shop_id` divergents ont
        pu être créés (invariant applicatif, pas contrainte SQL). Aucun
        appel S3, aucun appel service IA, statut `failed`, message générique,
        et bien sûr aucun `StockMovement`.
        """
        _other_user, other_shop = make_user_shop('tenant-b@example.com')
        cross_document = make_document(other_shop, _other_user)
        # OcrResult sur la boutique A, mais qui pointe sur un document de B.
        cross_ocr = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=cross_document,
        )
        stock_movements_before = StockMovement.objects.count()

        with (
            patch('apps.ocr.tasks.download_bytes') as mock_download,
            patch('apps.ocr.tasks.extract_text_with_ai_service') as mock_extract,
        ):
            from .tasks import process_invoice_ocr
            outcome = process_invoice_ocr.run(str(cross_ocr.pk))

        self.assertEqual(outcome, 'failed_tenant_mismatch')
        mock_download.assert_not_called()
        mock_extract.assert_not_called()

        cross_ocr.refresh_from_db()
        self.assertEqual(cross_ocr.status, OcrResult.STATUS_FAILED)
        # Aucune donnée OCR de B n'a été persistée dans le OcrResult de A.
        self.assertEqual(cross_ocr.raw_text, '')
        self.assertIsNone(cross_ocr.structured_data)
        self.assertIsNone(cross_ocr.confidence_score)
        # Message générique — ni détail d'erreur ni fuite d'object_key.
        self.assertNotIn(cross_document.object_key, cross_ocr.error_message)
        self.assertNotIn('tenant', cross_ocr.error_message.lower())

        # Aucun mouvement de stock (garantie de portée pour l'étape).
        self.assertEqual(StockMovement.objects.count(), stock_movements_before)


# ═══════════════════════════════════════════════════════════════════════════
# Vue upload : déclenchement Celery + broker indisponible (étape 5B)
# ═══════════════════════════════════════════════════════════════════════════


@override_settings(
    AWS_S3_ENDPOINT_URL='https://s3.example.com',
    AWS_ACCESS_KEY_ID='fake-access-key',
)
class SupplierInvoiceUploadTriggersCeleryTest(TestCase):
    URL = '/api/ocr/invoices/'

    def setUp(self) -> None:
        self.client = APIClient()
        self.owner, self.shop = make_user_shop('owner@example.com')
        self.client.force_authenticate(user=self.owner)

    def _jpeg(self) -> SimpleUploadedFile:
        return SimpleUploadedFile('facture.jpg', JPEG_BYTES, content_type='image/jpeg')

    def test_successful_upload_enqueues_task_once(self) -> None:
        with (
            patch('apps.ocr.services.upload_fileobj'),
            patch('apps.ocr.views.process_invoice_ocr.delay') as mock_delay,
        ):
            response = self.client.post(self.URL, {'document': self._jpeg()}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        mock_delay.assert_called_once()
        # L'argument passé DOIT être l'UUID de l'OcrResult créé, en str
        # (JSON-serializable pour Celery/Redis).
        ocr = OcrResult.objects.get(pk=response.data['ocr_result_id'])
        (arg,) = mock_delay.call_args.args
        self.assertEqual(arg, str(ocr.pk))

    def test_no_sync_ocr_call_during_upload(self) -> None:
        """La vue ne doit *jamais* appeler l'IA en synchrone : mock d'assert."""
        with (
            patch('apps.ocr.services.upload_fileobj'),
            patch('apps.ocr.views.process_invoice_ocr.delay'),
            patch('apps.ocr.tasks.extract_text_with_ai_service') as mock_ai,
            patch('apps.ocr.tasks.download_bytes') as mock_s3,
        ):
            response = self.client.post(self.URL, {'document': self._jpeg()}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        mock_ai.assert_not_called()
        mock_s3.assert_not_called()

    def test_broker_unavailable_returns_503_but_keeps_records(self) -> None:
        with (
            patch('apps.ocr.services.upload_fileobj'),
            patch(
                'apps.ocr.views.process_invoice_ocr.delay',
                side_effect=RuntimeError('broker down'),
            ),
        ):
            response = self.client.post(self.URL, {'document': self._jpeg()}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        # Les IDs sont exposés pour permettre une reprise manuelle par un op.
        self.assertIn('document_id', response.data)
        self.assertIn('ocr_result_id', response.data)
        # Les enregistrements restent en base (le document est déjà uploadé).
        self.assertTrue(UploadedDocument.objects.filter(pk=response.data['document_id']).exists())
        self.assertTrue(OcrResult.objects.filter(pk=response.data['ocr_result_id'], status='pending').exists())
        # Le message ne contient aucune trace technique.
        self.assertNotIn('broker', response.data['detail'].lower())


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/ocr/results/<uuid>/ — lecture multi-tenant (étape 5B)
# ═══════════════════════════════════════════════════════════════════════════


class OcrResultDetailViewTest(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.owner, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.owner)
        self.ocr = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_DONE,
            raw_text='ligne 1\nligne 2',
            confidence_score=Decimal('0.912'),
            structured_data={
                'ocr': {
                    'lines': [
                        {'text': 'ligne 1', 'confidence': 0.94, 'bbox': [1, 2, 3, 4]},
                        {'text': 'ligne 2', 'confidence': 0.88, 'bbox': []},
                    ],
                },
                'invoice': {
                    'supplier_name': 'ACME',
                    'invoice_number': 'INV-42',
                    'invoice_date': '2026-01-15',
                    'currency': 'EUR',
                    'subtotal': None,
                    'tax_amount': None,
                    'total': '19.99',
                    'lines': [
                        {
                            'description': 'Article A',
                            'supplier_reference': 'SKU-A',
                            'quantity': '1',
                            'unit_price': '19.99',
                            'line_total': '19.99',
                            'source_line_indices': [0],
                        },
                    ],
                    'warnings': [],
                    # Clé non prévue par le contrat — ne doit PAS être exposée
                    # même si elle a été écrite par un chemin parallèle.
                    'internal_debug_trace': 'super-secret',
                },
                # Namespace inconnu — écarté silencieusement par le serializer.
                'audit_only': {'note': 'ne pas exposer'},
            },
        )

    def _url(self, pk: object) -> str:
        return f'/api/ocr/results/{pk}/'

    def test_url_reverse(self) -> None:
        self.assertEqual(
            reverse('ocr-result-detail', kwargs={'ocr_result_id': str(self.ocr.pk)}),
            self._url(self.ocr.pk),
        )

    def test_unauthenticated_denied(self) -> None:
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_owner_reads_own_result(self) -> None:
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        data = response.data
        self.assertEqual(data['ocr_result_id'], str(self.ocr.pk))
        self.assertEqual(data['document_id'], str(self.document.pk))
        self.assertEqual(data['status'], OcrResult.STATUS_DONE)
        self.assertEqual(data['raw_text'], 'ligne 1\nligne 2')
        self.assertEqual(len(data['lines']), 2)
        self.assertEqual(data['lines'][0]['bbox'], [1, 2, 3, 4])

    def test_staff_with_stock_module_can_read(self) -> None:
        staff = User.objects.create_user(email='staff@example.com', password='Pass123!Strong')
        ShopMember.objects.create(
            shop=self.shop, user=staff, role='staff', permissions=['stock'],
        )
        self.client.force_authenticate(user=staff)
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_staff_without_stock_module_denied(self) -> None:
        staff = User.objects.create_user(email='staff-nostock@example.com', password='Pass123!Strong')
        ShopMember.objects.create(
            shop=self.shop, user=staff, role='staff', permissions=['products'],
        )
        self.client.force_authenticate(user=staff)
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_shop_returns_404_not_403(self) -> None:
        """Ne PAS confirmer l'existence d'une ressource d'une autre boutique."""
        other_owner, _ = make_user_shop('other@example.com')
        self.client.force_authenticate(user=other_owner)
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_uuid_returns_404(self) -> None:
        import uuid as _uuid
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(_uuid.uuid4()))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_response_never_exposes_object_key(self) -> None:
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.content.decode('utf-8')
        # Ni la clé, ni le nom du bucket, ni une URL S3 générique.
        self.assertNotIn('object_key', body)
        self.assertNotIn(self.document.object_key, body)
        self.assertNotIn('amazonaws', body.lower())
        self.assertNotIn('s3.', body.lower())

    def test_response_exposes_invoice_via_whitelist(self) -> None:
        """`structured_data.invoice` est exposé — mais UNIQUEMENT via la
        whitelist du serializer. Les clés non prévues sont écartées.
        """
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(self.ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        invoice = response.data.get('invoice')
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice['supplier_name'], 'ACME')
        self.assertEqual(invoice['invoice_number'], 'INV-42')
        self.assertEqual(invoice['invoice_date'], '2026-01-15')
        self.assertEqual(invoice['currency'], 'EUR')
        self.assertEqual(invoice['total'], '19.99')
        self.assertEqual(len(invoice['lines']), 1)
        self.assertEqual(invoice['lines'][0]['description'], 'Article A')
        self.assertEqual(invoice['lines'][0]['line_total'], '19.99')

        # Aucune clé imprévue ne doit fuiter.
        self.assertNotIn('internal_debug_trace', invoice)
        body = response.content.decode('utf-8')
        self.assertNotIn('internal_debug_trace', body)
        self.assertNotIn('super-secret', body)
        # Namespace inconnu écarté (« audit_only » n'apparaît pas à la racine).
        self.assertNotIn('audit_only', response.data)
        self.assertNotIn('audit_only', body)

    def test_pending_result_returns_status_only(self) -> None:
        pending = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
        )
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(pending.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], OcrResult.STATUS_PENDING)
        self.assertEqual(response.data['raw_text'], '')
        self.assertEqual(response.data['lines'], [])
        self.assertIsNone(response.data['confidence_score'])
        self.assertIsNone(response.data['invoice'])

    def test_failed_structuring_exposes_ocr_but_null_invoice(self) -> None:
        """OCR réussi + structuration LLM échouée : `invoice` reste `null`."""
        failed = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_FAILED,
            raw_text='texte reconnu',
            confidence_score=Decimal('0.912'),
            error_message="L'analyse structurée de la facture a échoué. Le texte OCR reste disponible.",
            structured_data={
                'ocr': {
                    'lines': [
                        {'text': 'texte reconnu', 'confidence': 0.94, 'bbox': [1, 2, 3, 4]},
                    ],
                },
            },
        )
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(failed.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], OcrResult.STATUS_FAILED)
        self.assertEqual(response.data['raw_text'], 'texte reconnu')
        self.assertEqual(len(response.data['lines']), 1)
        self.assertIsNone(response.data['invoice'])
        self.assertIn('structurée', response.data['error_message'])


# ═══════════════════════════════════════════════════════════════════════════
# structure_invoice_with_ai_service — POST JSON typé (étape 6B)
# ═══════════════════════════════════════════════════════════════════════════
#
# Même stratégie qu'`extract_text_with_ai_service` : `httpx.post` est patché,
# on ne vérifie que le contrat (URL, headers, timeout, parsing strict). Les
# tests réels du LLM vivent côté ai-service (tests/test_invoice_extraction.py).


@override_settings(
    AI_SERVICE_URL='http://ai-service:8000',
    AI_SERVICE_API_KEY=_TEST_AI_KEY,
    AI_SERVICE_INVOICE_TIMEOUT_SECONDS=50.0,
)
class StructureInvoiceWithAiServiceTest(SimpleTestCase):
    def _ocr_lines(self) -> list:
        from .ai_client import AiOcrLine
        return [
            AiOcrLine(text='ACME SARL', confidence=0.95, bbox=[10, 20, 100, 40]),
            AiOcrLine(text='Total 120,00 EUR', confidence=0.90, bbox=[10, 60, 200, 80]),
        ]

    def _valid_payload(self) -> dict:
        return {
            'supplier_name': 'ACME SARL',
            'invoice_number': 'INV-2026-001',
            'invoice_date': '2026-01-15',
            'currency': 'EUR',
            'subtotal': '100.00',
            'tax_amount': '20.00',
            'total': '120.00',
            'lines': [
                {
                    'description': 'Article A',
                    'supplier_reference': 'SKU-A',
                    'quantity': '2',
                    'unit_price': '50.00',
                    'line_total': '100.00',
                    'source_line_indices': [0, 1],
                },
            ],
            'warnings': [],
        }

    def test_nominal_returns_typed_extraction(self) -> None:
        from datetime import date as _date

        from .ai_client import structure_invoice_with_ai_service

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=self._valid_payload())
            result = structure_invoice_with_ai_service(
                raw_text='ACME SARL\nTotal 120,00 EUR',
                lines=self._ocr_lines(),
            )

        self.assertEqual(result.supplier_name, 'ACME SARL')
        self.assertEqual(result.invoice_number, 'INV-2026-001')
        self.assertEqual(result.invoice_date, _date(2026, 1, 15))
        self.assertEqual(result.currency, 'EUR')
        self.assertEqual(result.total, Decimal('120.00'))
        self.assertEqual(result.subtotal, Decimal('100.00'))
        self.assertEqual(result.tax_amount, Decimal('20.00'))
        self.assertEqual(len(result.lines), 1)
        line = result.lines[0]
        self.assertEqual(line.description, 'Article A')
        self.assertEqual(line.quantity, Decimal(2))
        self.assertEqual(line.unit_price, Decimal('50.00'))
        self.assertEqual(line.line_total, Decimal('100.00'))
        self.assertEqual(line.source_line_indices, [0, 1])
        self.assertEqual(result.warnings, [])

    def test_uses_expected_url_headers_timeout_and_payload(self) -> None:
        from .ai_client import (
            INTERNAL_API_KEY_HEADER,
            structure_invoice_with_ai_service,
        )

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=self._valid_payload())
            structure_invoice_with_ai_service(
                raw_text='ACME SARL\nTotal 120,00 EUR',
                lines=self._ocr_lines(),
            )

        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], 'http://ai-service:8000/internal/invoice/structure')
        self.assertEqual(kwargs['headers'], {INTERNAL_API_KEY_HEADER: _TEST_AI_KEY})
        self.assertEqual(kwargs['timeout'], 50.0)
        # Corps JSON = {raw_text, lines: [{text, confidence, bbox}, ...]}
        body = kwargs['json']
        self.assertEqual(body['raw_text'], 'ACME SARL\nTotal 120,00 EUR')
        self.assertEqual(len(body['lines']), 2)
        self.assertEqual(body['lines'][0]['text'], 'ACME SARL')
        self.assertEqual(body['lines'][0]['bbox'], [10, 20, 100, 40])

    def test_timeout_raises_domain_error(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        with patch(
            'apps.ocr.ai_client.httpx.post',
            side_effect=_httpx.ReadTimeout('too slow'),
        ), self.assertRaises(AiServiceUnavailableError):
            structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_transport_error_raises_domain_error(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        with patch(
            'apps.ocr.ai_client.httpx.post',
            side_effect=_httpx.ConnectError('refused'),
        ), self.assertRaises(AiServiceUnavailableError):
            structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_http_500_raises_domain_error(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(
                status_code=500, payload={'detail': 'boom'},
            )
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_http_400_raises_domain_error(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(
                status_code=400, payload={'detail': 'bad'},
            )
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_invalid_json_raises_domain_error(self) -> None:
        import json as _json_mod

        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        class _BadJson:
            status_code = 200

            def json(self_inner) -> object:
                raise _json_mod.JSONDecodeError('bad', '<html>', 0)

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _BadJson()
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_non_dict_payload_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=[1, 2, 3])
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_non_list_lines_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['lines'] = 'not-a-list'
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_line_missing_description_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['lines'][0].pop('description')
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_decimal_as_number_rejected(self) -> None:
        """Aucun cast implicite : les montants doivent arriver en `str`."""
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        for bad_value in (120.0, 120, True):
            payload = self._valid_payload()
            payload['total'] = bad_value
            with patch('apps.ocr.ai_client.httpx.post') as mock_post:
                mock_post.return_value = _FakeHttpxResponse(payload=payload)
                with self.assertRaises(AiServiceUnavailableError):
                    structure_invoice_with_ai_service(
                        raw_text='x', lines=self._ocr_lines(),
                    )

    def test_nan_and_infinity_decimal_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        for bad_value in ('NaN', 'Infinity', '-Infinity'):
            payload = self._valid_payload()
            payload['total'] = bad_value
            with patch('apps.ocr.ai_client.httpx.post') as mock_post:
                mock_post.return_value = _FakeHttpxResponse(payload=payload)
                with self.assertRaises(AiServiceUnavailableError):
                    structure_invoice_with_ai_service(
                        raw_text='x', lines=self._ocr_lines(),
                    )

    def test_negative_decimal_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['total'] = '-1.00'
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_malformed_decimal_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['total'] = 'not-a-number'
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_invalid_date_format_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        for bad_date in ('15/01/2026', '2026-1-5', '2026-01-15T12:00:00'):
            payload = self._valid_payload()
            payload['invoice_date'] = bad_date
            with patch('apps.ocr.ai_client.httpx.post') as mock_post:
                mock_post.return_value = _FakeHttpxResponse(payload=payload)
                with self.assertRaises(AiServiceUnavailableError):
                    structure_invoice_with_ai_service(
                        raw_text='x', lines=self._ocr_lines(),
                    )

    def test_source_index_out_of_bounds_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        # 2 lignes OCR fournies → indices valides = [0, 1]. On envoie 2.
        payload['lines'][0]['source_line_indices'] = [0, 2]
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_source_index_negative_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['lines'][0]['source_line_indices'] = [-1]
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_source_index_non_integer_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        for bad_indices in ([0, '1'], [0, 1.5], [0, True], 'not-a-list'):
            payload = self._valid_payload()
            payload['lines'][0]['source_line_indices'] = bad_indices
            with patch('apps.ocr.ai_client.httpx.post') as mock_post:
                mock_post.return_value = _FakeHttpxResponse(payload=payload)
                with self.assertRaises(AiServiceUnavailableError):
                    structure_invoice_with_ai_service(
                        raw_text='x', lines=self._ocr_lines(),
                    )

    def test_none_optional_fields_accepted(self) -> None:
        """`supplier_name`, `invoice_date`, etc. peuvent tous être null."""
        from .ai_client import structure_invoice_with_ai_service

        payload = {
            'supplier_name': None,
            'invoice_number': None,
            'invoice_date': None,
            'currency': None,
            'subtotal': None,
            'tax_amount': None,
            'total': None,
            'lines': [],
            'warnings': [],
        }
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            result = structure_invoice_with_ai_service(
                raw_text='x', lines=self._ocr_lines(),
            )
        self.assertIsNone(result.supplier_name)
        self.assertIsNone(result.total)
        self.assertEqual(result.lines, [])

    def test_warnings_must_be_list_of_str(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['warnings'] = [123, 'ok']
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    # ─── Contrat strict : clés obligatoires non nullables ─────────────────
    #
    # Les listes `lines` (racine), `warnings` et `source_line_indices` (par
    # ligne facture) sont obligatoires côté contrat réseau. Le service IA
    # doit renvoyer `[]` si le champ est vide — jamais `null` ni omission.
    # Toute déviation est refusée pour ne pas transformer silencieusement
    # une réponse incomplète en résultat "propre" côté Django.

    def test_root_lines_missing_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload.pop('lines')
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_root_lines_null_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['lines'] = None
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_warnings_missing_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload.pop('warnings')
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_warnings_null_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['warnings'] = None
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_source_line_indices_missing_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['lines'][0].pop('source_line_indices')
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_source_line_indices_null_rejected(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        payload = self._valid_payload()
        payload['lines'][0]['source_line_indices'] = None
        with patch('apps.ocr.ai_client.httpx.post') as mock_post:
            mock_post.return_value = _FakeHttpxResponse(payload=payload)
            with self.assertRaises(AiServiceUnavailableError):
                structure_invoice_with_ai_service(raw_text='x', lines=self._ocr_lines())

    def test_never_leaks_api_key(self) -> None:
        from .ai_client import (
            AiServiceUnavailableError,
            structure_invoice_with_ai_service,
        )

        with (
            self.assertLogs('apps.ocr.ai_client', level=_logging.WARNING) as logs,
            patch(
                'apps.ocr.ai_client.httpx.post',
                side_effect=_httpx.ConnectError('refused'),
            ),
        ):
            try:
                structure_invoice_with_ai_service(
                    raw_text='sensitive', lines=self._ocr_lines(),
                )
            except AiServiceUnavailableError as exc:
                self.assertNotIn(_TEST_AI_KEY, str(exc))
                if exc.__cause__ is not None:
                    self.assertNotIn(_TEST_AI_KEY, str(exc.__cause__))
        for entry in logs.output:
            self.assertNotIn(_TEST_AI_KEY, entry)
            # Le contenu potentiellement sensible ne doit pas non plus fuiter.
            self.assertNotIn('sensitive', entry)


# ═══════════════════════════════════════════════════════════════════════════
# process_invoice_ocr — comportement quand la structuration LLM échoue (6B)
# ═══════════════════════════════════════════════════════════════════════════


class ProcessInvoiceOcrStructuringFailureTest(TestCase):
    """La structuration LLM est un point de défaillance distinct de l'OCR :
    on doit préserver le texte reconnu (raw_text + ocr namespace + score)
    même si le LLM refuse la structuration.
    """

    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.user)
        self.ocr = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
        )

    def _run(self) -> str:
        from .tasks import process_invoice_ocr
        return process_invoice_ocr.run(str(self.ocr.pk))

    def test_structuring_ai_service_error_preserves_ocr(self) -> None:
        from .ai_client import AiServiceUnavailableError

        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'\xff\xd8\xff...'),
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                return_value=_fake_extraction(),
            ),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                side_effect=AiServiceUnavailableError('LLM down'),
            ),
        ):
            outcome = self._run()

        self.assertEqual(outcome, 'failed_structuring')
        self.ocr.refresh_from_db()
        # État : `failed`, mais avec l'OCR préservé.
        self.assertEqual(self.ocr.status, OcrResult.STATUS_FAILED)
        self.assertEqual(self.ocr.raw_text, 'ligne 1\nligne 2')
        self.assertEqual(self.ocr.confidence_score, Decimal('0.912'))
        self.assertIn('ocr', self.ocr.structured_data)
        self.assertEqual(len(self.ocr.structured_data['ocr']['lines']), 2)
        # AUCUNE clé `invoice` — on n'invente pas de structure vide.
        self.assertNotIn('invoice', self.ocr.structured_data)
        # Message spécifique à la structuration (pas le générique OCR).
        self.assertIn('structurée', self.ocr.error_message)
        # Aucun détail interne (« LLM down », stack…) ne doit fuiter.
        self.assertNotIn('LLM', self.ocr.error_message)
        self.assertNotIn('down', self.ocr.error_message)

    def test_structuring_unexpected_exception_preserves_ocr(self) -> None:
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'\xff\xd8\xff...'),
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                return_value=_fake_extraction(),
            ),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                side_effect=TypeError('unexpected'),
            ),
        ):
            outcome = self._run()

        self.assertEqual(outcome, 'failed_structuring_unexpected')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_FAILED)
        self.assertEqual(self.ocr.raw_text, 'ligne 1\nligne 2')
        self.assertEqual(self.ocr.confidence_score, Decimal('0.912'))
        self.assertIn('ocr', self.ocr.structured_data)
        self.assertNotIn('invoice', self.ocr.structured_data)

    def test_no_stock_movement_on_structuring_failure(self) -> None:
        from .ai_client import AiServiceUnavailableError

        before = StockMovement.objects.count()
        with (
            patch('apps.ocr.tasks.download_bytes', return_value=b'\xff\xd8\xff...'),
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                return_value=_fake_extraction(),
            ),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                side_effect=AiServiceUnavailableError('LLM down'),
            ),
        ):
            self._run()
        self.assertEqual(StockMovement.objects.count(), before)


# ═══════════════════════════════════════════════════════════════════════════
# mark_ocr_failed — persistance partielle OCR après échec structuration (6B)
# ═══════════════════════════════════════════════════════════════════════════


class MarkOcrFailedPartialPersistenceTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.user)

    def _make_processing(self) -> OcrResult:
        return OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_PROCESSING,
        )

    def test_partial_ocr_preserved_on_failure(self) -> None:
        from .services import mark_ocr_failed

        ocr = self._make_processing()
        result = mark_ocr_failed(
            ocr.pk,
            error_message='structuration KO',
            raw_text='texte reconnu',
            structured_data={'ocr': {'lines': []}},
            confidence_score=Decimal('0.912'),
        )
        result.refresh_from_db()
        self.assertEqual(result.status, OcrResult.STATUS_FAILED)
        self.assertEqual(result.raw_text, 'texte reconnu')
        self.assertEqual(result.structured_data, {'ocr': {'lines': []}})
        self.assertEqual(result.confidence_score, Decimal('0.912'))
        self.assertEqual(result.error_message, 'structuration KO')

    def test_partial_persistence_confidence_bounds_enforced(self) -> None:
        from .services import InvalidConfidenceScoreError, mark_ocr_failed

        ocr = self._make_processing()
        with self.assertRaises(InvalidConfidenceScoreError):
            mark_ocr_failed(
                ocr.pk,
                error_message='ko',
                raw_text='x',
                confidence_score=Decimal('1.001'),
            )
        ocr.refresh_from_db()
        # Statut inchangé : la validation borne-t-elle avant la transaction.
        self.assertEqual(ocr.status, OcrResult.STATUS_PROCESSING)
        self.assertEqual(ocr.raw_text, '')

    def test_partial_persistence_validated_state_immutable(self) -> None:
        """Un OCR déjà validé humainement ne peut PAS être écrasé, même en
        échec avec des données partielles."""
        from .services import InvalidOcrTransitionError, mark_ocr_failed

        ocr = OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_VALIDATED,
            raw_text='humain-validé',
        )
        with self.assertRaises(InvalidOcrTransitionError):
            mark_ocr_failed(
                ocr.pk,
                error_message='ko',
                raw_text='nouveau-texte',
                structured_data={'ocr': {'lines': []}},
                confidence_score=Decimal('0.5'),
            )
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_VALIDATED)
        self.assertEqual(ocr.raw_text, 'humain-validé')

    def test_partial_persistence_backward_compat_without_extras(self) -> None:
        """Sans paramètres optionnels, comportement historique inchangé."""
        from .services import mark_ocr_failed

        ocr = self._make_processing()
        mark_ocr_failed(ocr.pk, error_message='old-flow')
        ocr.refresh_from_db()
        self.assertEqual(ocr.status, OcrResult.STATUS_FAILED)
        self.assertEqual(ocr.raw_text, '')
        self.assertIsNone(ocr.structured_data)
        self.assertIsNone(ocr.confidence_score)


# ═══════════════════════════════════════════════════════════════════════════
# match_invoice_lines_to_variants — service déterministe (étape 7)
# ═══════════════════════════════════════════════════════════════════════════
#
# Tests unitaires du service de matching. Aucun appel LLM, aucun HTTP, aucune
# écriture stock. Chaque test vérifie une invariant précise du contrat :
# isolation tenant, priorités des kinds, seuil de similarité, plafond,
# déduplication, exclusions (inactif, service).


def _make_product(
    shop: Shop,
    name: str,
    *,
    type_: str = 'product',
    is_active: bool = True,
) -> Product:
    return Product.objects.create(shop=shop, name=name, type=type_, is_active=is_active)


def _make_variant(
    shop: Shop,
    product: Product,
    packaging: str,
    *,
    sku: str = '',
    barcode: str = '',
    is_active: bool = True,
    selling_price: str = '9.90',
) -> ProductVariant:
    return ProductVariant.objects.create(
        shop=shop,
        product=product,
        packaging_name=packaging,
        sku=sku,
        barcode=barcode,
        selling_price=Decimal(selling_price),
        is_active=is_active,
    )


def _invoice_line(
    description: str,
    *,
    supplier_reference: str | None = None,
    indices: list[int] | None = None,
) -> object:
    from .ai_client import AiInvoiceLine
    return AiInvoiceLine(
        description=description,
        supplier_reference=supplier_reference,
        quantity=Decimal(1),
        unit_price=Decimal('9.90'),
        line_total=Decimal('9.90'),
        source_line_indices=indices if indices is not None else [],
    )


def _invoice_extraction(lines: list) -> object:
    from datetime import date as _date

    from .ai_client import AiInvoiceExtraction
    return AiInvoiceExtraction(
        supplier_name='ACME',
        invoice_number='INV-001',
        invoice_date=_date(2026, 1, 15),
        currency='EUR',
        subtotal=Decimal('100.00'),
        tax_amount=Decimal('20.00'),
        total=Decimal('120.00'),
        lines=lines,
        warnings=[],
    )


class MatchInvoiceLinesToVariantsTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')

    def _run(self, lines: list) -> object:
        from .matching import match_invoice_lines_to_variants
        return match_invoice_lines_to_variants(
            shop_id=self.shop.id,
            extraction=_invoice_extraction(lines),
        )

    def test_barcode_exact_is_top_candidate(self) -> None:
        product = _make_product(self.shop, 'Farine T65')
        variant = _make_variant(self.shop, product, 'Sac 5kg', barcode='3760001234567')
        line = _invoice_line('Farine T65 sac', supplier_reference='3760001234567')

        result = self._run([line])

        (matched_line,) = result.lines
        self.assertEqual(matched_line.invoice_line_index, 0)
        self.assertEqual(len(matched_line.candidates), 1)
        candidate = matched_line.candidates[0]
        self.assertEqual(candidate.variant_id, str(variant.pk))
        self.assertEqual(candidate.match_kind, 'barcode_exact')
        self.assertEqual(candidate.similarity_score, 100)

    def test_sku_exact_is_candidate_but_never_validated(self) -> None:
        """Une égalité SKU génère un candidat mais n'écrit RIEN dans le
        catalogue : `variant.sku` reste inchangé après le matching."""
        product = _make_product(self.shop, 'Farine T65')
        variant = _make_variant(self.shop, product, 'Sac 5kg', sku='SKU-42')
        line = _invoice_line('Farine T65 sac 5kg', supplier_reference='SKU-42')

        original_sku = variant.sku
        original_barcode = variant.barcode

        result = self._run([line])

        (matched_line,) = result.lines
        (candidate,) = matched_line.candidates
        self.assertEqual(candidate.match_kind, 'sku_exact')
        self.assertEqual(candidate.similarity_score, 100)

        # Aucune écriture DB — le catalogue reste immuable.
        variant.refresh_from_db()
        self.assertEqual(variant.sku, original_sku)
        self.assertEqual(variant.barcode, original_barcode)

    def test_supplier_reference_never_writes_sku_or_barcode(self) -> None:
        """La supplier_reference ne doit JAMAIS remplir sku/barcode, même si
        le variant n'en a pas et que la description matche par nom."""
        product = _make_product(self.shop, 'Farine T65')
        variant = _make_variant(self.shop, product, 'Sac 5kg')  # sku/barcode vides
        line = _invoice_line(
            'Farine T65 sac 5kg', supplier_reference='SUPPLIER-XYZ-999',
        )

        self._run([line])

        variant.refresh_from_db()
        self.assertEqual(variant.sku, '')
        self.assertEqual(variant.barcode, '')

    def test_name_similarity_returns_candidates_above_threshold(self) -> None:
        product = _make_product(self.shop, 'Farine T65 bio')
        variant = _make_variant(self.shop, product, 'Sac 5kg')
        line = _invoice_line('Farine T65 bio 5kg')

        result = self._run([line])

        (matched_line,) = result.lines
        self.assertEqual(len(matched_line.candidates), 1)
        candidate = matched_line.candidates[0]
        self.assertEqual(candidate.variant_id, str(variant.pk))
        self.assertEqual(candidate.match_kind, 'name_similarity')
        self.assertGreaterEqual(candidate.similarity_score, 70)

    def test_normalization_case_accent_punctuation(self) -> None:
        """Casse / accents / ponctuation ne doivent PAS empêcher le match."""
        product = _make_product(self.shop, 'Crème brûlée artisanale')
        _make_variant(self.shop, product, 'Pot 100g')
        # Casse inversée, accents supprimés, ponctuation exotique.
        line = _invoice_line('CREME.BRULEE---ARTISANALE!!!')

        result = self._run([line])

        (matched_line,) = result.lines
        self.assertEqual(len(matched_line.candidates), 1)
        self.assertEqual(matched_line.candidates[0].match_kind, 'name_similarity')

    def test_similarity_below_threshold_excluded(self) -> None:
        product = _make_product(self.shop, 'Farine T65')
        _make_variant(self.shop, product, 'Sac 5kg')
        line = _invoice_line('Chaussures de randonnée pointure 42')

        result = self._run([line])

        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates, [])

    def test_max_three_candidates_per_line(self) -> None:
        for i in range(6):
            product = _make_product(self.shop, f'Farine T65 lot {i}')
            _make_variant(self.shop, product, 'Sac 5kg')
        line = _invoice_line('Farine T65 lot 1')

        result = self._run([line])

        (matched_line,) = result.lines
        self.assertLessEqual(len(matched_line.candidates), 3)

    def test_deterministic_ordering_barcode_before_sku_before_name(self) -> None:
        """L'ordre des candidats suit strictement barcode > sku > nom."""
        # Trois variantes très similaires mais un seul match par kind.
        p_barcode = _make_product(self.shop, 'Farine T65 A')
        v_barcode = _make_variant(
            self.shop, p_barcode, 'Sac 5kg', barcode='3760001234567',
        )
        p_sku = _make_product(self.shop, 'Farine T65 B')
        v_sku = _make_variant(self.shop, p_sku, 'Sac 5kg', sku='SKU-99')
        p_name = _make_product(self.shop, 'Farine T65 C')
        v_name = _make_variant(self.shop, p_name, 'Sac 5kg')
        name_only_variant_ids = {str(v_name.pk)}

        # supplier_reference matche le barcode. Description matche les noms.
        # Le SKU n'est matché par personne, donc pour tester la priorité SKU
        # il faut une deuxième ligne :
        line = _invoice_line('Farine T65', supplier_reference='3760001234567')
        result = self._run([line])

        # Une seule ligne, mais elle doit renvoyer jusqu'à 3 candidats dont
        # le premier est barcode_exact.
        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates[0].variant_id, str(v_barcode.pk))
        self.assertEqual(matched_line.candidates[0].match_kind, 'barcode_exact')
        # Les autres candidats doivent être des name_similarity (SKU non
        # matché par cette ligne), et inclure v_name.
        other_kinds = {c.match_kind for c in matched_line.candidates[1:]}
        self.assertEqual(other_kinds, {'name_similarity'})
        other_ids = {c.variant_id for c in matched_line.candidates[1:]}
        self.assertTrue(name_only_variant_ids.issubset(other_ids))

        # Deuxième invocation : supplier_reference matche SKU.
        line2 = _invoice_line('Farine T65', supplier_reference='SKU-99')
        result2 = self._run([line2])
        (matched2,) = result2.lines
        self.assertEqual(matched2.candidates[0].variant_id, str(v_sku.pk))
        self.assertEqual(matched2.candidates[0].match_kind, 'sku_exact')
        # `v_name` doit apparaître après (name_similarity).
        kinds = [c.match_kind for c in matched2.candidates]
        self.assertEqual(kinds[0], 'sku_exact')
        for kind in kinds[1:]:
            self.assertEqual(kind, 'name_similarity')

    def test_same_variant_not_duplicated_across_kinds(self) -> None:
        """Un variant qui matche à la fois SKU et nom n'apparaît qu'une fois,
        avec le kind le plus prioritaire (sku_exact)."""
        product = _make_product(self.shop, 'Farine T65')
        variant = _make_variant(self.shop, product, 'Sac 5kg', sku='SKU-1')
        line = _invoice_line('Farine T65 sac', supplier_reference='SKU-1')

        result = self._run([line])

        (matched_line,) = result.lines
        self.assertEqual(len(matched_line.candidates), 1)
        self.assertEqual(matched_line.candidates[0].variant_id, str(variant.pk))
        self.assertEqual(matched_line.candidates[0].match_kind, 'sku_exact')

    def test_no_matches_returns_empty_candidates(self) -> None:
        # Aucune variante en base.
        line = _invoice_line('Article inconnu', supplier_reference='XYZ-000')
        result = self._run([line])
        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates, [])

    def test_inactive_variant_excluded(self) -> None:
        product = _make_product(self.shop, 'Farine T65')
        _make_variant(self.shop, product, 'Sac 5kg', sku='SKU-1', is_active=False)
        line = _invoice_line('Farine T65 sac', supplier_reference='SKU-1')

        result = self._run([line])
        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates, [])

    def test_inactive_product_excluded(self) -> None:
        product = _make_product(self.shop, 'Farine T65', is_active=False)
        _make_variant(self.shop, product, 'Sac 5kg', sku='SKU-1')
        line = _invoice_line('Farine T65 sac', supplier_reference='SKU-1')

        result = self._run([line])
        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates, [])

    def test_service_type_excluded(self) -> None:
        """Les services (Product.type=='service') n'ont pas de stock physique
        à faire correspondre à une facture fournisseur."""
        product = _make_product(self.shop, 'Livraison à domicile', type_='service')
        _make_variant(self.shop, product, 'Standard', sku='LIV-1')
        line = _invoice_line('Livraison à domicile', supplier_reference='LIV-1')

        result = self._run([line])
        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates, [])

    def test_cross_tenant_variants_never_appear(self) -> None:
        """Un variant d'une autre boutique NE DOIT JAMAIS apparaître."""
        _other_user, other_shop = make_user_shop('other@example.com')
        other_product = Product.objects.create(shop=other_shop, name='Farine T65')
        ProductVariant.objects.create(
            shop=other_shop, product=other_product,
            packaging_name='Sac 5kg', sku='SKU-1', barcode='3760001234567',
            selling_price=Decimal('9.90'),
        )
        line = _invoice_line(
            'Farine T65 sac 5kg', supplier_reference='3760001234567',
        )

        result = self._run([line])
        (matched_line,) = result.lines
        self.assertEqual(matched_line.candidates, [])

    def test_empty_supplier_reference_still_matches_by_name(self) -> None:
        """Sans supplier_reference, on retombe sur la similarité de nom."""
        product = _make_product(self.shop, 'Farine T65 bio')
        _make_variant(self.shop, product, 'Sac 5kg')
        line = _invoice_line('Farine T65 bio', supplier_reference=None)

        result = self._run([line])
        (matched_line,) = result.lines
        self.assertEqual(len(matched_line.candidates), 1)
        self.assertEqual(matched_line.candidates[0].match_kind, 'name_similarity')

    def test_multiple_invoice_lines_each_get_own_candidates(self) -> None:
        p1 = _make_product(self.shop, 'Farine T65')
        v1 = _make_variant(self.shop, p1, 'Sac 5kg', barcode='B1')
        p2 = _make_product(self.shop, 'Sucre roux')
        v2 = _make_variant(self.shop, p2, 'Sachet 1kg', barcode='B2')

        result = self._run([
            _invoice_line('Farine T65 sac', supplier_reference='B1'),
            _invoice_line('Sucre roux', supplier_reference='B2'),
        ])

        self.assertEqual(len(result.lines), 2)
        self.assertEqual(result.lines[0].invoice_line_index, 0)
        self.assertEqual(result.lines[0].candidates[0].variant_id, str(v1.pk))
        self.assertEqual(result.lines[1].invoice_line_index, 1)
        self.assertEqual(result.lines[1].candidates[0].variant_id, str(v2.pk))


# ═══════════════════════════════════════════════════════════════════════════
# process_invoice_ocr — intégration matching (étape 7)
# ═══════════════════════════════════════════════════════════════════════════


class ProcessInvoiceOcrMatchingTest(TestCase):
    def setUp(self) -> None:
        self.user, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.user)
        self.ocr = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
        )

    def _run(self) -> str:
        from .tasks import process_invoice_ocr
        return process_invoice_ocr.run(str(self.ocr.pk))

    def _patch_pipeline(self) -> tuple:
        """Retourne les patches (download, extract, structure) déjà configurés."""
        return (
            patch('apps.ocr.tasks.download_bytes', return_value=b'\xff\xd8\xff...'),
            patch(
                'apps.ocr.tasks.extract_text_with_ai_service',
                return_value=_fake_extraction(),
            ),
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service',
                return_value=_fake_invoice(),
            ),
        )

    def test_matching_persisted_on_success(self) -> None:
        """Nominal : ocr + invoice + matching persistés en un seul dict."""
        # `_fake_invoice()` a une ligne avec supplier_reference='SKU-A' et
        # description='Article A' → on met un variant qui matche par SKU.
        product = _make_product(self.shop, 'Article A')
        variant = _make_variant(self.shop, product, 'Standard', sku='SKU-A')

        p_download, p_extract, p_structure = self._patch_pipeline()
        with p_download, p_extract, p_structure:
            outcome = self._run()

        self.assertEqual(outcome, 'done')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_DONE)

        structured = self.ocr.structured_data
        self.assertIn('ocr', structured)
        self.assertIn('invoice', structured)
        self.assertIn('matching', structured)

        matching = structured['matching']
        self.assertEqual(matching['status'], 'done')
        self.assertEqual(len(matching['lines']), 1)
        matched_line = matching['lines'][0]
        self.assertEqual(matched_line['invoice_line_index'], 0)
        (candidate,) = matched_line['candidates']
        self.assertEqual(candidate['variant_id'], str(variant.pk))
        self.assertEqual(candidate['match_kind'], 'sku_exact')
        self.assertEqual(candidate['similarity_score'], 100)

    def test_matching_empty_candidates_still_done(self) -> None:
        """Aucune variante en base → matching.status=done, candidates=[]."""
        p_download, p_extract, p_structure = self._patch_pipeline()
        with p_download, p_extract, p_structure:
            outcome = self._run()

        self.assertEqual(outcome, 'done')
        self.ocr.refresh_from_db()
        matching = self.ocr.structured_data['matching']
        self.assertEqual(matching['status'], 'done')
        # La liste des lignes reste peuplée (une ligne facture → une entrée
        # avec `candidates: []`).
        self.assertEqual(len(matching['lines']), 1)
        self.assertEqual(matching['lines'][0]['candidates'], [])

    def test_matching_failure_preserves_invoice_and_ocr(self) -> None:
        """Si le matching lève, on garde ocr+invoice et matching.status=failed.

        Le statut OcrResult reste `done` : matching est un enrichissement
        indépendant, sa panne ne doit pas cacher la facture au commerçant.
        """
        p_download, p_extract, p_structure = self._patch_pipeline()
        with (
            p_download, p_extract, p_structure,
            patch(
                'apps.ocr.tasks.match_invoice_lines_to_variants',
                side_effect=RuntimeError('DB timeout'),
            ),
        ):
            outcome = self._run()

        self.assertEqual(outcome, 'done')
        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_DONE)

        structured = self.ocr.structured_data
        self.assertIn('ocr', structured)
        self.assertIn('invoice', structured)
        # invoice reste intact.
        self.assertEqual(structured['invoice']['supplier_name'], 'ACME')
        # matching écrit son propre statut d'échec.
        self.assertEqual(structured['matching'], {'status': 'failed', 'lines': []})

    def test_no_stock_movement_on_matching_success(self) -> None:
        product = _make_product(self.shop, 'Article A')
        _make_variant(self.shop, product, 'Standard', sku='SKU-A')

        p_download, p_extract, p_structure = self._patch_pipeline()
        before = StockMovement.objects.count()
        with p_download, p_extract, p_structure:
            self._run()
        self.assertEqual(StockMovement.objects.count(), before)

    def test_no_stock_movement_on_matching_failure(self) -> None:
        p_download, p_extract, p_structure = self._patch_pipeline()
        before = StockMovement.objects.count()
        with (
            p_download, p_extract, p_structure,
            patch(
                'apps.ocr.tasks.match_invoice_lines_to_variants',
                side_effect=RuntimeError('boom'),
            ),
        ):
            self._run()
        self.assertEqual(StockMovement.objects.count(), before)

    def test_stock_quantity_unchanged_after_matching(self) -> None:
        product = _make_product(self.shop, 'Article A')
        variant = _make_variant(self.shop, product, 'Standard', sku='SKU-A')
        original_stock = variant.stock_quantity

        p_download, p_extract, p_structure = self._patch_pipeline()
        with p_download, p_extract, p_structure:
            self._run()

        variant.refresh_from_db()
        self.assertEqual(variant.stock_quantity, original_stock)

    def test_tenant_mismatch_never_runs_matching(self) -> None:
        """Le contrôle tenant existant doit court-circuiter AVANT tout appel
        au matching : S3, IA, structuring, matching = jamais exécutés."""
        _other_user, other_shop = make_user_shop('tenant-b@example.com')
        cross_document = make_document(other_shop, _other_user)
        cross_ocr = OcrResult.objects.create(
            shop=self.shop, uploaded_document=cross_document,
        )

        with (
            patch('apps.ocr.tasks.download_bytes') as mock_download,
            patch('apps.ocr.tasks.extract_text_with_ai_service') as mock_extract,
            patch(
                'apps.ocr.tasks.structure_invoice_with_ai_service'
            ) as mock_structure,
            patch(
                'apps.ocr.tasks.match_invoice_lines_to_variants'
            ) as mock_matching,
        ):
            from .tasks import process_invoice_ocr
            outcome = process_invoice_ocr.run(str(cross_ocr.pk))

        self.assertEqual(outcome, 'failed_tenant_mismatch')
        mock_download.assert_not_called()
        mock_extract.assert_not_called()
        mock_structure.assert_not_called()
        mock_matching.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/ocr/results/<uuid>/ — exposition namespace matching (étape 7)
# ═══════════════════════════════════════════════════════════════════════════


class OcrResultDetailMatchingViewTest(TestCase):
    """Vérifie l'exposition contrôlée du namespace matching côté API."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.owner, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.owner)

    def _url(self, pk: object) -> str:
        return f'/api/ocr/results/{pk}/'

    def _base_structured(self, extra_matching: dict | None = None) -> dict:
        return {
            'ocr': {'lines': []},
            'invoice': {
                'supplier_name': 'ACME',
                'invoice_number': 'INV-1',
                'invoice_date': None,
                'currency': 'EUR',
                'subtotal': None,
                'tax_amount': None,
                'total': None,
                'lines': [],
                'warnings': [],
            },
            **({'matching': extra_matching} if extra_matching is not None else {}),
        }

    def _make_ocr(self, structured: dict) -> OcrResult:
        return OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_DONE,
            raw_text='texte',
            structured_data=structured,
        )

    def test_matching_exposed_via_whitelist(self) -> None:
        import uuid as _uuid

        variant_id = str(_uuid.uuid4())
        product_id = str(_uuid.uuid4())
        ocr = self._make_ocr(self._base_structured({
            'status': 'done',
            'lines': [
                {
                    'invoice_line_index': 0,
                    'candidates': [
                        {
                            'variant_id': variant_id,
                            'product_id': product_id,
                            'product_name': 'Article A',
                            'packaging_name': 'Standard',
                            'match_kind': 'sku_exact',
                            'similarity_score': 100,
                            # Clé imprévue — ne doit PAS être exposée.
                            'internal_debug': 'secret',
                        },
                    ],
                    # Clé imprévue au niveau ligne.
                    'ignored_line_extra': 'nope',
                },
            ],
            # Clé imprévue au niveau namespace.
            'debug_trace': 'super-secret',
        }))

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        matching = response.data['matching']
        self.assertIsNotNone(matching)
        self.assertEqual(matching['status'], 'done')
        self.assertEqual(len(matching['lines']), 1)
        line = matching['lines'][0]
        self.assertEqual(line['invoice_line_index'], 0)
        self.assertEqual(len(line['candidates']), 1)
        candidate = line['candidates'][0]
        self.assertEqual(candidate['variant_id'], variant_id)
        self.assertEqual(candidate['match_kind'], 'sku_exact')
        self.assertEqual(candidate['similarity_score'], 100)

        # Aucune clé imprévue ne fuite.
        body = response.content.decode('utf-8')
        self.assertNotIn('internal_debug', body)
        self.assertNotIn('super-secret', body)
        self.assertNotIn('debug_trace', body)
        self.assertNotIn('ignored_line_extra', body)

    def test_legacy_result_without_matching_returns_null(self) -> None:
        """Un OCR ancien sans namespace matching → matching=null."""
        ocr = self._make_ocr({
            'ocr': {'lines': []},
            'invoice': self._base_structured()['invoice'],
        })
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['matching'])

    def test_matching_failed_status_exposed(self) -> None:
        """Un matching en échec doit exposer proprement status=failed."""
        ocr = self._make_ocr(self._base_structured({
            'status': 'failed',
            'lines': [],
        }))
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['matching'], {'status': 'failed', 'lines': []},
        )

    def test_unknown_status_value_returns_null_matching(self) -> None:
        """Un status inconnu (regression future) → matching=null (pas d'exposition)."""
        ocr = self._make_ocr(self._base_structured({
            'status': 'weird',
            'lines': [],
        }))
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['matching'])

    def test_cross_tenant_get_returns_404(self) -> None:
        """Une autre boutique ne peut PAS lire le matching."""
        ocr = self._make_ocr(self._base_structured({
            'status': 'done', 'lines': [],
        }))
        other_owner, _ = make_user_shop('other@example.com')
        self.client.force_authenticate(user=other_owner)
        response = self.client.get(self._url(ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_object_key_never_exposed_with_matching(self) -> None:
        ocr = self._make_ocr(self._base_structured({
            'status': 'done', 'lines': [],
        }))
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self._url(ocr.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.content.decode('utf-8')
        self.assertNotIn('object_key', body)
        self.assertNotIn(self.document.object_key, body)


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/ocr/results/<uuid>/validate/ — validation humaine (Step 9A)
# ═══════════════════════════════════════════════════════════════════════════
#
# Cette étape ne modifie ABSOLUMENT PAS le stock : elle grave uniquement la
# décision humaine dans `structured_data['review']` et bascule le statut vers
# `validated`. Chaque test qui touche à un cas nominal vérifie explicitement
# qu'aucun `StockMovement` n'a été créé et que `stock_quantity` est inchangé
# — c'est la garantie contractuelle de Step 9 vs Step 10.


class ValidateInvoiceReviewViewTest(TestCase):
    URL_NAME = 'ocr-result-validate'

    def setUp(self) -> None:
        self.client = APIClient()
        self.owner, self.shop = make_user_shop('owner@example.com')
        self.document = make_document(self.shop, self.owner)

        # Catalogue local : un produit actif à deux variantes actives, un
        # produit inactif, une variante inactive, un service.
        self.product_a = _make_product(self.shop, 'Farine T65')
        self.variant_a = _make_variant(
            self.shop, self.product_a, 'Sac 5kg', barcode='3760001234567',
        )
        self.variant_a_bis = _make_variant(
            self.shop, self.product_a, 'Sac 25kg', sku='FAR-25',
        )
        self.product_inactive = _make_product(
            self.shop, 'Produit inactif', is_active=False,
        )
        self.variant_of_inactive_product = _make_variant(
            self.shop, self.product_inactive, 'Pack',
        )
        self.variant_inactive = _make_variant(
            self.shop, self.product_a, 'Sac 1kg', is_active=False,
        )
        self.service = _make_product(self.shop, 'Livraison', type_='service')
        self.variant_service = _make_variant(
            self.shop, self.service, 'Standard',
        )

        # Boutique voisine : ses ressources ne doivent jamais fuiter.
        self.other_owner, self.other_shop = make_user_shop('other@example.com')
        self.other_product = _make_product(self.other_shop, 'Sucre')
        self.other_variant = _make_variant(
            self.other_shop, self.other_product, 'Sachet 1kg',
        )

        # OcrResult standard : status=done, 2 lignes facture.
        self.ocr = self._make_done_ocr(lines_count=2)

    # ── helpers ─────────────────────────────────────────────────────────
    def _url(self, ocr_id: object) -> str:
        return reverse(self.URL_NAME, kwargs={'ocr_result_id': str(ocr_id)})

    def _make_done_ocr(self, *, lines_count: int = 2) -> OcrResult:
        invoice_lines = [
            {
                'description': f'Article {i}',
                'supplier_reference': None,
                'quantity': '1',
                'unit_price': '9.90',
                'line_total': '9.90',
                'source_line_indices': [i],
            }
            for i in range(lines_count)
        ]
        return OcrResult.objects.create(
            shop=self.shop,
            uploaded_document=self.document,
            status=OcrResult.STATUS_DONE,
            raw_text='ligne',
            structured_data={
                'ocr': {'lines': []},
                'invoice': {
                    'supplier_name': 'ACME',
                    'invoice_number': 'INV-9',
                    'invoice_date': '2026-01-15',
                    'currency': 'EUR',
                    'subtotal': None,
                    'tax_amount': None,
                    'total': '19.80',
                    'lines': invoice_lines,
                    'warnings': [],
                },
                'matching': {'status': 'done', 'lines': []},
            },
        )

    def _line(
        self,
        *,
        index: int,
        decision: str = 'stock',
        variant_id: object | None = None,
        description: str = 'Corrigé',
        quantity: str | None = '2.000',
        unit_price: str | None = '10.00',
        line_total: str | None = '20.00',
    ) -> dict:
        payload: dict[str, object] = {
            'invoice_line_index': index,
            'description': description,
            'quantity': quantity,
            'unit_price': unit_price,
            'line_total': line_total,
            'decision': decision,
            'variant_id': str(variant_id) if variant_id is not None else None,
        }
        return payload

    def _valid_payload(self) -> dict:
        return {
            'lines': [
                self._line(index=0, variant_id=self.variant_a.pk),
                self._line(
                    index=1, decision='ignore', variant_id=None,
                    description='À ignorer', quantity=None, unit_price=None,
                    line_total=None,
                ),
            ],
        }

    def _post(self, ocr_id: object, payload: dict) -> object:
        self.client.force_authenticate(user=self.owner)
        return self.client.post(
            self._url(ocr_id), payload, format='json',
        )

    # ── URL / permissions ───────────────────────────────────────────────
    def test_url_reverse(self) -> None:
        self.assertEqual(
            self._url(self.ocr.pk),
            f'/api/ocr/results/{self.ocr.pk}/validate/',
        )

    def test_unauthenticated_denied(self) -> None:
        response = self.client.post(
            self._url(self.ocr.pk), self._valid_payload(), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_without_stock_module_denied(self) -> None:
        staff = User.objects.create_user(
            email='staff-nostock@example.com', password='Pass123!Strong',
        )
        ShopMember.objects.create(
            shop=self.shop, user=staff, role='staff', permissions=['products'],
        )
        self.client.force_authenticate(user=staff)
        response = self.client.post(
            self._url(self.ocr.pk), self._valid_payload(), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_with_stock_module_can_validate(self) -> None:
        staff = User.objects.create_user(
            email='staff-stock@example.com', password='Pass123!Strong',
        )
        ShopMember.objects.create(
            shop=self.shop, user=staff, role='staff', permissions=['stock'],
        )
        self.client.force_authenticate(user=staff)
        response = self.client.post(
            self._url(self.ocr.pk), self._valid_payload(), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    # ── Nominal ─────────────────────────────────────────────────────────
    def test_nominal_validation_transitions_to_validated(self) -> None:
        before = timezone.now()
        response = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.status, OcrResult.STATUS_VALIDATED)
        self.assertEqual(self.ocr.validated_by_user, self.owner)
        self.assertIsNotNone(self.ocr.validated_at)
        self.assertGreaterEqual(self.ocr.validated_at, before)

    def test_review_persisted_without_overwriting_ocr_invoice_matching(self) -> None:
        original_ocr = dict(self.ocr.structured_data['ocr'])
        original_invoice = dict(self.ocr.structured_data['invoice'])
        original_matching = dict(self.ocr.structured_data['matching'])

        response = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ocr.refresh_from_db()
        self.assertEqual(self.ocr.structured_data['ocr'], original_ocr)
        self.assertEqual(self.ocr.structured_data['invoice'], original_invoice)
        self.assertEqual(self.ocr.structured_data['matching'], original_matching)
        self.assertIn('review', self.ocr.structured_data)
        self.assertEqual(self.ocr.structured_data['review']['schema_version'], 1)
        self.assertEqual(len(self.ocr.structured_data['review']['lines']), 2)

    def test_amounts_stored_as_strings(self) -> None:
        response = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ocr.refresh_from_db()
        review_line = self.ocr.structured_data['review']['lines'][0]
        self.assertIsInstance(review_line['quantity'], str)
        self.assertIsInstance(review_line['unit_price'], str)
        self.assertIsInstance(review_line['line_total'], str)
        # Format canonique — précision Decimal alignée sur les colonnes.
        self.assertEqual(review_line['quantity'], '2.000')
        self.assertEqual(review_line['unit_price'], '10.00')
        self.assertEqual(review_line['line_total'], '20.00')

    def test_response_exposes_review_and_validated_at(self) -> None:
        response = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data['status'], OcrResult.STATUS_VALIDATED)
        self.assertIsNotNone(data['validated_at'])
        self.assertIsNotNone(data['review'])
        self.assertEqual(data['review']['schema_version'], 1)
        # Lignes triées par index (comparaison canonique de l'idempotence).
        indices = [line['invoice_line_index'] for line in data['review']['lines']]
        self.assertEqual(indices, sorted(indices))

    # ── Rejets de format Decimal ────────────────────────────────────────
    def test_reject_float_quantity(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['quantity'] = 2.0
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_int_unit_price(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['unit_price'] = 10
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_bool_line_total(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['line_total'] = True
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_nan_quantity(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['quantity'] = 'NaN'
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_infinity_unit_price(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['unit_price'] = 'Infinity'
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_quantity_with_too_many_decimals(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['quantity'] = '2.0001'  # 4 décimales
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Rejet contrat contrat / indices ─────────────────────────────────
    def test_missing_line_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'] = payload['lines'][:1]  # index 1 manquant
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extra_line_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'].append(
            self._line(index=99, decision='ignore', variant_id=None,
                       quantity=None, unit_price=None, line_total=None),
        )
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicated_index_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][1]['invoice_line_index'] = 0  # doublon de index=0
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_decision_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['decision'] = 'delete'
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Rejet des combinaisons decision × variant/quantity ──────────────
    def test_stock_without_variant_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['variant_id'] = None
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_with_null_quantity_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['quantity'] = None
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_with_zero_quantity_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['quantity'] = '0.000'
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_with_negative_quantity_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['quantity'] = '-1.000'
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ignore_with_variant_id_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][1]['variant_id'] = str(self.variant_a.pk)
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Rejet des variantes hors périmètre ──────────────────────────────
    def test_variant_from_other_shop_rejected_generically(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['variant_id'] = str(self.other_variant.pk)
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Ne révèle jamais que la variante existe dans une autre boutique.
        body = response.content.decode('utf-8')
        self.assertNotIn(str(self.other_shop.pk), body)
        self.assertNotIn(self.other_product.name, body)

    def test_inactive_variant_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['variant_id'] = str(self.variant_inactive.pk)
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_variant_of_inactive_product_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['variant_id'] = str(self.variant_of_inactive_product.pk)
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_service_variant_rejected(self) -> None:
        payload = self._valid_payload()
        payload['lines'][0]['variant_id'] = str(self.variant_service.pk)
        response = self._post(self.ocr.pk, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Multi-tenant + statuts ──────────────────────────────────────────
    def test_ocr_of_other_shop_returns_404(self) -> None:
        payload = self._valid_payload()
        self.client.force_authenticate(user=self.other_owner)
        response = self.client.post(
            self._url(self.ocr.pk), payload, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_result_cannot_be_validated(self) -> None:
        pending = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
        )
        response = self._post(pending.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_processing_result_cannot_be_validated(self) -> None:
        processing = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
            status=OcrResult.STATUS_PROCESSING,
        )
        response = self._post(processing.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_failed_result_cannot_be_validated(self) -> None:
        failed = OcrResult.objects.create(
            shop=self.shop, uploaded_document=self.document,
            status=OcrResult.STATUS_FAILED, error_message='échec',
        )
        response = self._post(failed.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    # ── Idempotence ─────────────────────────────────────────────────────
    def test_retry_same_payload_is_idempotent(self) -> None:
        payload = self._valid_payload()
        r1 = self._post(self.ocr.pk, payload)
        self.assertEqual(r1.status_code, status.HTTP_200_OK, r1.content)
        first_validated_at = r1.data['validated_at']

        r2 = self._post(self.ocr.pk, payload)
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.content)
        # `validated_at` figé sur la première validation — le retry ne l'écrase pas.
        self.assertEqual(r2.data['validated_at'], first_validated_at)

    def test_retry_same_payload_reordered_is_idempotent(self) -> None:
        payload = self._valid_payload()
        r1 = self._post(self.ocr.pk, payload)
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        reordered = self._valid_payload()
        reordered['lines'] = list(reversed(reordered['lines']))
        r2 = self._post(self.ocr.pk, reordered)
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.content)

    def test_retry_different_payload_conflicts(self) -> None:
        r1 = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        divergent = self._valid_payload()
        # Change la variante — décision divergente qui doit lever 409.
        divergent['lines'][0]['variant_id'] = str(self.variant_a_bis.pk)
        r2 = self._post(self.ocr.pk, divergent)
        self.assertEqual(r2.status_code, status.HTTP_409_CONFLICT, r2.content)

    # ── Garantie stock : STEP 9 NE MODIFIE RIEN ────────────────────────
    def test_no_stock_movement_created(self) -> None:
        response = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Aucun StockMovement ni pour la boutique courante ni globalement.
        self.assertEqual(
            StockMovement.objects.filter(shop=self.shop).count(), 0,
        )
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_variant_stock_quantity_unchanged(self) -> None:
        before = self.variant_a.stock_quantity
        response = self._post(self.ocr.pk, self._valid_payload())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.variant_a.refresh_from_db()
        self.assertEqual(self.variant_a.stock_quantity, before)
