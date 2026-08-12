"""Logique métier OCR.

Cette étape ne fait qu'ingérer une photo de facture fournisseur :
- validation légère de la signature binaire du fichier ;
- upload dans l'Object Storage privé ;
- création d'un `UploadedDocument` + d'un `OcrResult` (status=pending).

Aucun appel OCR / IA n'est déclenché ici — c'est l'objet des étapes suivantes.
"""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, NamedTuple

from django.db import transaction

from apps.core.storage import delete_object, upload_fileobj

from .models import OcrResult, UploadedDocument

if TYPE_CHECKING:
    from uuid import UUID

    from django.core.files.uploadedfile import UploadedFile

    from apps.accounts.models import User
    from apps.shops.models import Shop


logger = logging.getLogger(__name__)


__all__ = (
    'InvalidConfidenceScoreError',
    'InvalidFileSignatureError',
    'InvalidOcrTransitionError',
    'SupplierInvoiceUpload',
    'create_supplier_invoice_upload',
    'mark_ocr_done',
    'mark_ocr_failed',
    'mark_ocr_processing',
    'validate_file_signature',
)


# Bornes du score de confiance retourné par la reconnaissance. Alignées sur
# les validators du modèle (`OcrResult.confidence_score`), qui ne sont pas
# exécutés automatiquement par `Model.save()` — on vérifie donc explicitement
# ici pour ne jamais persister une valeur hors intervalle.
_CONFIDENCE_MIN = Decimal('0.000')
_CONFIDENCE_MAX = Decimal('1.000')


class InvalidFileSignatureError(ValueError):
    """Le binaire du fichier ne correspond pas au MIME annoncé.

    Exception domaine — laisse le service indépendant de DRF. Le serializer
    l'attrape et la convertit en `serializers.ValidationError`.
    """


class InvalidOcrTransitionError(ValueError):
    """Transition de statut non autorisée sur un `OcrResult`.

    Exception domaine (subclass de `ValueError`) — permet aux futures tâches
    Celery et endpoints de gérer les cas d'erreur sans coupler ce module à
    DRF. Le message inclut la transition tentée pour faciliter le debug.
    """


class InvalidConfidenceScoreError(ValueError):
    """Score de confiance en dehors de l'intervalle attendu (0.000–1.000).

    Exception domaine — pendant symétrique de `InvalidOcrTransitionError`
    pour tout ce qui bloque la finalisation d'un OCR. Les validators du
    modèle ne sont pas exécutés par `Model.save()` : on doit donc valider
    explicitement au service avant persistance.
    """


# Mapping MIME → extension utilisée pour construire l'object_key. On refuse
# de dériver l'extension du filename utilisateur (potentiellement mensonger).
_MIME_TO_EXTENSION: dict[str, str] = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}


class SupplierInvoiceUpload(NamedTuple):
    document: UploadedDocument
    ocr_result: OcrResult


def validate_file_signature(file: UploadedFile, declared_mime: str) -> None:
    """Vérifie que les premiers octets correspondent au MIME annoncé.

    Le `content_type` d'un `UploadedFile` provient de l'en-tête HTTP fourni
    par le client — donc trivialement forgeable. On lit ici la « magic
    number » du fichier pour détecter un binaire qui ne correspond pas à
    l'image annoncée. Implémentation volontairement minimaliste : pas de
    dépendance externe (python-magic, filetype…), on couvre uniquement les
    trois formats acceptés à cette étape.
    """
    # 12 octets suffisent pour distinguer JPEG / PNG / WebP.
    file.seek(0)
    header = file.read(12)
    file.seek(0)

    if declared_mime == 'image/jpeg':
        ok = header.startswith(b'\xff\xd8\xff')
    elif declared_mime == 'image/png':
        ok = header.startswith(b'\x89PNG\r\n\x1a\n')
    elif declared_mime == 'image/webp':
        ok = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
    else:
        ok = False

    if not ok:
        raise InvalidFileSignatureError(
            'Le contenu du fichier ne correspond pas au type déclaré.'
        )


def create_supplier_invoice_upload(
    *,
    shop: Shop,
    user: User,
    file: UploadedFile,
) -> SupplierInvoiceUpload:
    """Ingère une photo de facture fournisseur.

    Contrat :
    - `shop` provient de `get_shop(request.user)` — jamais du client.
    - `file` a déjà été validé côté serializer (présence, taille, MIME).
    - le `OcrResult` créé partage strictement le même `shop` que le document.

    En cas d'échec DB après l'upload S3, l'objet distant est supprimé pour
    éviter les fichiers orphelins (pas de transaction distribuée, simple
    compensation manuelle).
    """
    extension = _MIME_TO_EXTENSION[file.content_type]
    object_key = f'ocr/{shop.pk}/supplier-invoices/{uuid.uuid4()}.{extension}'

    # Sécurité : re-vérifie la signature juste avant l'upload — on ne veut
    # pas se retrouver à uploader un binaire arbitraire même si le serializer
    # a été court-circuité par un usage direct du service.
    validate_file_signature(file, file.content_type)

    upload_fileobj(file, object_key, file.content_type)

    try:
        with transaction.atomic():
            document = UploadedDocument.objects.create(
                shop=shop,
                uploaded_by_user=user,
                document_type=UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE,
                object_key=object_key,
                original_filename=(file.name or '')[:255],
                mime_type=file.content_type,
                size_bytes=file.size,
            )
            ocr_result = OcrResult.objects.create(
                shop=shop,
                uploaded_document=document,
                status=OcrResult.STATUS_PENDING,
            )
    except Exception:
        # Compensation : le fichier est déjà distant, on le retire pour
        # ne pas laisser d'orphelin. `delete_object` log mais ne relève pas.
        logger.exception(
            "Échec DB après upload OCR — nettoyage de l'objet %s", object_key,
        )
        delete_object(object_key)
        raise

    return SupplierInvoiceUpload(document=document, ocr_result=ocr_result)


# ─── Transitions de statut OcrResult ────────────────────────────────────────
#
# La machine à états est volontairement stricte : chaque transition n'accepte
# qu'un statut source unique. Le statut `validated` est réservé à une action
# métier explicite (relecture humaine) et n'est jamais posé par ces fonctions.
#
# Chaque transition est protégée par `select_for_update` : un second worker
# qui tenterait la même transition en parallèle est bloqué jusqu'à la fin de
# la transaction courante, puis lit l'état déjà mis à jour et lève
# `InvalidOcrTransitionError` — pas de course silencieuse possible.


def _raise_invalid_transition(current: str, target: str) -> None:
    raise InvalidOcrTransitionError(
        f"Transition OCR invalide : {current} → {target}."
    )


def mark_ocr_processing(ocr_result_id: UUID) -> OcrResult:
    """Bascule un OcrResult de `pending` vers `processing`.

    Appelée par la tâche Celery juste avant d'exécuter la reconnaissance :
    évite qu'un second worker ne reprenne un travail déjà en cours.
    """
    with transaction.atomic():
        result = OcrResult.objects.select_for_update().get(pk=ocr_result_id)
        if result.status != OcrResult.STATUS_PENDING:
            _raise_invalid_transition(result.status, OcrResult.STATUS_PROCESSING)
        result.status = OcrResult.STATUS_PROCESSING
        result.error_message = ''
        result.save(update_fields=['status', 'error_message', 'updated_at'])
    return result


def mark_ocr_done(
    ocr_result_id: UUID,
    *,
    raw_text: str,
    structured_data: dict | None = None,
    confidence_score: Decimal | None = None,
) -> OcrResult:
    """Termine une reconnaissance : `processing` → `done`.

    Stocke le texte brut et, si fournis, les données structurées et le score
    de confiance. Ne touche pas aux champs de validation humaine
    (`validated_by_user`, `validated_at`) — c'est un flux distinct.

    Le score de confiance est validé avant l'ouverture de la transaction :
    en cas de valeur hors bornes, aucun verrou n'est pris et le OcrResult
    reste dans son statut courant (`processing`).
    """
    if confidence_score is not None and not (
        _CONFIDENCE_MIN <= confidence_score <= _CONFIDENCE_MAX
    ):
        raise InvalidConfidenceScoreError(
            f'confidence_score doit être dans [{_CONFIDENCE_MIN}, {_CONFIDENCE_MAX}], '
            f'reçu : {confidence_score}.'
        )

    with transaction.atomic():
        result = OcrResult.objects.select_for_update().get(pk=ocr_result_id)
        if result.status != OcrResult.STATUS_PROCESSING:
            _raise_invalid_transition(result.status, OcrResult.STATUS_DONE)
        result.status = OcrResult.STATUS_DONE
        result.raw_text = raw_text
        result.error_message = ''
        update_fields = ['status', 'raw_text', 'error_message', 'updated_at']
        if structured_data is not None:
            result.structured_data = structured_data
            update_fields.append('structured_data')
        if confidence_score is not None:
            result.confidence_score = confidence_score
            update_fields.append('confidence_score')
        result.save(update_fields=update_fields)
    return result


def mark_ocr_failed(
    ocr_result_id: UUID,
    *,
    error_message: str,
) -> OcrResult:
    """Marque un OCR en échec : `processing` → `failed`.

    Le message d'erreur doit rester safe pour affichage : ne pas y injecter
    de stack trace ni de chemin serveur. Détails techniques → logs.
    """
    with transaction.atomic():
        result = OcrResult.objects.select_for_update().get(pk=ocr_result_id)
        if result.status != OcrResult.STATUS_PROCESSING:
            _raise_invalid_transition(result.status, OcrResult.STATUS_FAILED)
        result.status = OcrResult.STATUS_FAILED
        result.error_message = error_message
        result.save(update_fields=['status', 'error_message', 'updated_at'])
    return result
