"""Tâches Celery du module OCR.

Deux tâches à ce stade :

- `ocr_worker_healthcheck` — sonde du worker `celery-ocr` (posée à l'étape 3).
- `process_invoice_ocr` — pipeline complet : lecture du document dans le
  bucket privé, appel du service IA (PaddleOCR), persistance du texte brut
  et des lignes détectées sur l'`OcrResult` correspondant.

`process_invoice_ocr` est déclenchée depuis la vue d'upload avec `.delay()`
après commit DB : la boutique voit son OCR passer `pending → processing →
done` (ou `failed`) sans bloquer la réponse HTTP.
"""
from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from celery import shared_task
from django.utils import timezone

from apps.core.storage import download_bytes

from .ai_client import (
    AiInvoiceExtraction,
    AiOcrExtraction,
    AiServiceUnavailableError,
    extract_text_with_ai_service,
    structure_invoice_with_ai_service,
)
from .models import OcrResult
from .services import (
    InvalidConfidenceScoreError,
    InvalidOcrTransitionError,
    mark_ocr_done,
    mark_ocr_failed,
    mark_ocr_processing,
)

logger = logging.getLogger(__name__)


# Message générique remonté côté commerçant. Volontairement non technique :
# le détail (stack, code HTTP, chemin S3) reste dans les logs serveur.
_GENERIC_FAILURE_MESSAGE = "L'extraction du texte a échoué. Veuillez réessayer."

# Message spécifique quand l'OCR a réussi mais que la structuration LLM a
# échoué : on veut expliquer au commerçant qu'il peut quand même consulter
# le texte reconnu (préservé sur l'OcrResult malgré le status=failed).
_STRUCTURING_FAILURE_MESSAGE = (
    "L'analyse structurée de la facture a échoué. Le texte OCR reste disponible."
)

# Précision cible pour le champ `OcrResult.confidence_score`
# (`DecimalField(max_digits=4, decimal_places=3)`).
_CONFIDENCE_QUANTUM = Decimal('0.001')


def _to_decimal_confidence(value: float | None) -> Decimal | None:
    """Convertit un `float` de confiance en `Decimal(4, 3)`.

    On passe par `Decimal(str(value))` pour éviter la représentation binaire
    imprécise des floats (`Decimal(0.1)` = `0.100000...5551`). La quantisation
    est bornée pour garantir qu'on ne tentera pas de persister une valeur
    hors intervalle si `_transform_result` a laissé passer une aberration.
    """
    if value is None:
        return None
    try:
        raw = Decimal(str(value))
    except InvalidOperation:
        return None
    quantized = raw.quantize(_CONFIDENCE_QUANTUM, rounding=ROUND_HALF_UP)
    if quantized < Decimal('0.000'):
        return Decimal('0.000')
    if quantized > Decimal('1.000'):
        return Decimal('1.000')
    return quantized


@shared_task(name='apps.ocr.tasks.ocr_worker_healthcheck')
def ocr_worker_healthcheck() -> dict[str, str]:
    """Sonde du worker OCR — ne modifie rien, ne contacte rien.

    Retourne un petit dict sérialisable qui prouve que la tâche a bien été
    exécutée par un worker Celery. Utile pour valider le déploiement du
    service `celery-ocr` sans avoir à orchestrer une vraie image.
    """
    return {
        'status': 'ok',
        'worker': 'ocr',
        'checked_at': timezone.now().isoformat(),
    }


@shared_task(name='apps.ocr.tasks.process_invoice_ocr')
def process_invoice_ocr(ocr_result_id: str) -> str:
    """Exécute l'extraction OCR de bout en bout sur un `OcrResult` pending.

    Étapes :
    1. Transition `pending → processing` (protégée par `select_for_update`).
       Si la transition est refusée (double delivery, statut déjà avancé),
       on sort silencieusement — ne pas écraser l'état déjà en place.
    2. Téléchargement du document depuis Object Storage.
    3. Appel du service IA (PaddleOCR via FastAPI) avec timeout dédié.
    4. Écriture du résultat : `raw_text`, `structured_data['ocr']`, score.
       En cas d'échec à n'importe quelle étape après le passage en
       `processing`, on bascule en `failed` avec un message générique.

    La tâche ne relève jamais : la config Celery actuelle n'active
    `autoretry_for` sur aucune tâche et `process_invoice_ocr` n'appelle
    pas `self.retry()`. Un exception non capturée ferait donc uniquement
    logger une trace côté worker et marquerait la tâche `FAILURE` dans le
    result backend — sans relance. On préfère gérer nous-mêmes l'échec en
    base pour rendre l'état visible au commerçant.

    Ne crée jamais de `StockMovement` : la conversion en mouvements de stock
    est explicitement réservée à une étape ultérieure (validation humaine).
    """
    # Étape 1 : transition pending -> processing.
    try:
        mark_ocr_processing(ocr_result_id)
    except OcrResult.DoesNotExist:
        # OcrResult supprimé entre le POST et l'exécution de la tâche —
        # rien à faire, on log en info pour tracer sans polluer les alertes.
        logger.info('OCR result %s introuvable, tâche ignorée.', ocr_result_id)
        return 'not_found'
    except InvalidOcrTransitionError:
        # Double delivery Celery (at-least-once) : un autre worker a déjà pris
        # le travail. On ne retouche pas au statut courant, on n'échoue pas.
        logger.info(
            'OCR result %s déjà avancé au-delà de pending, tâche ignorée.',
            ocr_result_id,
        )
        return 'skipped'

    # À partir d'ici, tout échec doit marquer le OCR en `failed`.
    ocr = OcrResult.objects.select_related('uploaded_document').get(pk=ocr_result_id)
    document = ocr.uploaded_document

    # Cohérence multi-tenant. Rien dans le schéma n'empêche techniquement
    # `OcrResult.shop_id != UploadedDocument.shop_id` (deux FK indépendantes
    # vers `shops`). Si l'invariant est violé, on refuse de lire le fichier
    # d'une autre boutique — même si un attaquant est parvenu à créer un
    # OcrResult qui pointe sur le document d'un tenant tiers, le worker ne
    # doit jamais l'exfiltrer via l'appel au service IA.
    if ocr.shop_id != document.shop_id:
        logger.error(
            'Incohérence de tenant détectée sur OCR %s '
            '(ocr.shop_id=%s, document.shop_id=%s) — traitement refusé.',
            ocr_result_id, ocr.shop_id, document.shop_id,
        )
        mark_ocr_failed(ocr_result_id, error_message=_GENERIC_FAILURE_MESSAGE)
        return 'failed_tenant_mismatch'

    try:
        content = download_bytes(document.object_key)
    except Exception:
        logger.exception(
            'Téléchargement S3 échoué pour OCR %s (object_key masqué).',
            ocr_result_id,
        )
        mark_ocr_failed(ocr_result_id, error_message=_GENERIC_FAILURE_MESSAGE)
        return 'failed_storage'

    try:
        extraction = extract_text_with_ai_service(
            content=content,
            filename=document.original_filename or 'invoice',
            mime_type=document.mime_type or 'application/octet-stream',
        )
    except AiServiceUnavailableError:
        # Le message d'exception ne contient déjà aucun secret ni chemin.
        logger.warning('Service IA indisponible pour OCR %s.', ocr_result_id)
        mark_ocr_failed(ocr_result_id, error_message=_GENERIC_FAILURE_MESSAGE)
        return 'failed_ai_service'
    except Exception:
        # Filet de sécurité — toute erreur non prévue reste captée.
        logger.exception('Erreur inattendue pendant l\'OCR %s.', ocr_result_id)
        mark_ocr_failed(ocr_result_id, error_message=_GENERIC_FAILURE_MESSAGE)
        return 'failed_unexpected'

    ocr_namespace = _build_ocr_namespace(extraction)
    confidence = _to_decimal_confidence(extraction.confidence_score)

    # Étape 6B : structuration LLM. On appelle après l'OCR pour ne pas re-payer
    # la reconnaissance PaddleOCR en cas d'échec côté LLM. En cas d'échec, on
    # préserve les données OCR (raw_text + `structured_data['ocr']` + score)
    # via `mark_ocr_failed(..., raw_text=, structured_data=, confidence_score=)`
    # : le commerçant peut consulter le texte extrait même sans structure.
    try:
        invoice = structure_invoice_with_ai_service(
            raw_text=extraction.raw_text,
            lines=extraction.lines,
        )
    except AiServiceUnavailableError:
        logger.warning(
            'Service IA (structuration) indisponible pour OCR %s.', ocr_result_id,
        )
        _mark_failed_preserving_ocr(
            ocr_result_id,
            extraction=extraction,
            ocr_namespace=ocr_namespace,
            confidence=confidence,
        )
        return 'failed_structuring'
    except Exception:
        # Filet de sécurité — on ne perd jamais l'OCR sur une erreur inattendue
        # pendant la structuration.
        logger.exception(
            'Erreur inattendue pendant la structuration facture %s.', ocr_result_id,
        )
        _mark_failed_preserving_ocr(
            ocr_result_id,
            extraction=extraction,
            ocr_namespace=ocr_namespace,
            confidence=confidence,
        )
        return 'failed_structuring_unexpected'

    structured_data = {
        # Namespace `ocr` volontairement isolé du namespace `invoice` : les
        # deux évoluent indépendamment et un futur re-traitement (relance
        # LLM) doit pouvoir écraser `invoice` sans toucher au brut OCR.
        'ocr': ocr_namespace,
        'invoice': _invoice_to_jsonable(invoice),
    }

    try:
        mark_ocr_done(
            ocr_result_id,
            raw_text=extraction.raw_text,
            structured_data=structured_data,
            confidence_score=confidence,
        )
    except InvalidConfidenceScoreError:
        # `_to_decimal_confidence` borne déjà, donc ce chemin est très
        # improbable — on garde le filet pour ne rien laisser passer.
        logger.exception(
            'Score de confiance hors bornes pour OCR %s.', ocr_result_id,
        )
        mark_ocr_failed(ocr_result_id, error_message=_GENERIC_FAILURE_MESSAGE)
        return 'failed_invalid_confidence'

    return 'done'


def _build_ocr_namespace(extraction: AiOcrExtraction) -> dict:
    """Sérialise le résultat OCR pour le champ `structured_data['ocr']`."""
    return {
        'lines': [
            {
                'text': line.text,
                'confidence': line.confidence,
                'bbox': line.bbox,
            }
            for line in extraction.lines
        ],
    }


def _invoice_to_jsonable(invoice: AiInvoiceExtraction) -> dict:
    """Convertit un `AiInvoiceExtraction` en dict JSON-sérialisable.

    Les `Decimal` deviennent des strings (précision préservée, pas d'arrondi
    binaire) et la date ISO passe par `isoformat()`. Ce format est celui
    persisté dans `OcrResult.structured_data` et relu par le serializer.
    """
    return {
        'supplier_name': invoice.supplier_name,
        'invoice_number': invoice.invoice_number,
        'invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        'currency': invoice.currency,
        'subtotal': str(invoice.subtotal) if invoice.subtotal is not None else None,
        'tax_amount': str(invoice.tax_amount) if invoice.tax_amount is not None else None,
        'total': str(invoice.total) if invoice.total is not None else None,
        'lines': [
            {
                'description': line.description,
                'supplier_reference': line.supplier_reference,
                'quantity': str(line.quantity) if line.quantity is not None else None,
                'unit_price': str(line.unit_price) if line.unit_price is not None else None,
                'line_total': str(line.line_total) if line.line_total is not None else None,
                'source_line_indices': list(line.source_line_indices),
            }
            for line in invoice.lines
        ],
        'warnings': list(invoice.warnings),
    }


def _mark_failed_preserving_ocr(
    ocr_result_id: str,
    *,
    extraction: AiOcrExtraction,
    ocr_namespace: dict,
    confidence: Decimal | None,
) -> None:
    """Bascule en `failed` en conservant le résultat OCR déjà obtenu.

    Volontairement PAS d'entrée `invoice` dans `structured_data` : la
    structuration n'a pas abouti, on ne doit pas mentir sur l'existence
    d'une structure côté API.
    """
    try:
        mark_ocr_failed(
            ocr_result_id,
            error_message=_STRUCTURING_FAILURE_MESSAGE,
            raw_text=extraction.raw_text,
            structured_data={'ocr': ocr_namespace},
            confidence_score=confidence,
        )
    except InvalidConfidenceScoreError:
        logger.exception(
            'Score OCR hors bornes pendant échec structuration %s.', ocr_result_id,
        )
        mark_ocr_failed(ocr_result_id, error_message=_GENERIC_FAILURE_MESSAGE)
