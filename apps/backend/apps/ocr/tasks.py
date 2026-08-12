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

from .ai_client import AiServiceUnavailableError, extract_text_with_ai_service
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

    structured_data = {
        # Namespace `ocr` volontairement isolé : l'étape 6 (extraction
        # structurée) ajoutera `structured_data['invoice']` sans écraser
        # les données brutes conservées ici pour audit / debug.
        'ocr': {
            'lines': [
                {
                    'text': line.text,
                    'confidence': line.confidence,
                    'bbox': line.bbox,
                }
                for line in extraction.lines
            ],
        },
    }

    confidence = _to_decimal_confidence(extraction.confidence_score)

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
