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
