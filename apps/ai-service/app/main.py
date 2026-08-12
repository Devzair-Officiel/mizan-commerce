"""Service IA Mizan — endpoints FastAPI.

Endpoints exposés :

- `GET  /health`                        : sonde publique du processus.
- `GET  /internal/health`               : sonde protégée (auth service-to-service).
- `POST /internal/ocr/extract-text`     : OCR pur d'une image (protégé).
- `POST /internal/invoice/structure`    : proposition structurée d'une
  facture à partir d'une sortie OCR, via un LLM externe (protégé, POC 6A).

Interprétation métier :
- `extract-text` reste OCR pur — texte brut + confiances + bboxes.
- `invoice/structure` produit une *proposition* de structure de facture
  (fournisseur, numéro, lignes, montants). Aucune écriture, aucun matching
  produit, aucun mouvement de stock : la validation humaine reste requise
  côté backend Mizan.
"""
from __future__ import annotations

import logging
import os
import tempfile

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status

from . import config
from .file_validation import FileValidationError, validate_uploaded_document
from .invoice_extraction import (
    InvoiceExtractionError,
    MissingProviderKeyError,
    ProviderUnavailableError,
    extract_invoice_structure,
)
from .ocr import OcrEngineError, extract_text_from_image
from .schemas import InvoiceExtraction, InvoiceStructureRequest, OcrExtractionResult
from .security import require_internal_api_key

logger = logging.getLogger(__name__)

# Extensions demandées par PaddleOCR (`suffix` du tempfile). La validation
# préalable garantit que `content_type` est déjà dans la liste blanche.
_TEMP_SUFFIX_BY_MIME: dict[str, str] = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
}

app = FastAPI(
    title='Mizan AI Service',
    version='0.2.0',
    docs_url=None,      # pas d'exposition Swagger sur un service interne
    redoc_url=None,
    openapi_url=None,
)


@app.get('/health')
def health() -> dict[str, str]:
    """Sonde publique — vivante = FastAPI répond.

    N'accède ni à PostgreSQL, ni à Redis, ni au moteur OCR. C'est
    volontairement le seul endpoint sans clé, pour permettre à un
    orchestrateur (Docker healthcheck, uptime robot interne) de vérifier
    que le processus tourne sans exposer la clé.
    """
    return {'status': 'ok', 'service': config.SERVICE_NAME}


@app.get('/internal/health', dependencies=[Depends(require_internal_api_key)])
def internal_health() -> dict[str, str | bool]:
    """Sonde interne — prouve que l'auth service-to-service fonctionne."""
    return {
        'status': 'ok',
        'service': config.SERVICE_NAME,
        'authenticated': True,
    }


@app.post(
    '/internal/ocr/extract-text',
    dependencies=[Depends(require_internal_api_key)],
    response_model=OcrExtractionResult,
)
async def extract_text(document: UploadFile = File(...)) -> OcrExtractionResult:
    """Extrait le texte brut d'un document image via PaddleOCR.

    - Validation locale : taille, MIME, signature binaire.
    - Écriture dans un `tempfile` : le nom fourni par le client n'est
      jamais utilisé comme chemin disque.
    - Suppression garantie du fichier temporaire même en cas d'erreur OCR.
    """
    content = await document.read()

    try:
        validate_uploaded_document(
            content=content,
            content_type=document.content_type,
        )
    except FileValidationError as exc:
        # Message court, réutilisé tel quel côté client — aucun détail
        # technique ni chemin disque.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # `delete=False` pour pouvoir passer le chemin à PaddleOCR (qui rouvre
    # le fichier) puis supprimer explicitement dans le `finally`. On ignore
    # totalement `document.filename` — jamais utilisé comme chemin.
    #
    # Le suffixe doit correspondre au MIME réel : PaddleOCR filtre les
    # extensions (`.png`, `.jpg`, `.webp`, …) et refuse silencieusement
    # tout suffixe inconnu en renvoyant une inférence vide.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=_TEMP_SUFFIX_BY_MIME[document.content_type])
    try:
        tmp.write(content)
        tmp.flush()
        tmp.close()
        try:
            return extract_text_from_image(tmp.name)
        except OcrEngineError as exc:
            logger.warning('OCR engine error: %s', exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail='Erreur interne du moteur OCR.',
            ) from exc
    finally:
        # Nettoyage best-effort : `missing_ok=True` en Python 3.8+.
        try:
            os.unlink(tmp.name)
        except FileNotFoundError:
            pass


@app.post(
    '/internal/invoice/structure',
    dependencies=[Depends(require_internal_api_key)],
    response_model=InvoiceExtraction,
)
def structure_invoice(payload: InvoiceStructureRequest) -> InvoiceExtraction:
    """Propose une structure de facture à partir d'une sortie OCR (POC 6A).

    - Aucune image ni donnée métier Mizan n'est envoyée au provider LLM ;
      uniquement `raw_text` + lignes OCR (texte, confiance, bbox).
    - `MissingProviderKeyError` → 503 (config incomplète côté serveur).
    - `ProviderUnavailableError` → 502 (timeout, panne, rate limit).
    - `InvoiceExtractionError` → 400/502 selon origine (OCR vide → 400 ;
      contrat provider violé → 502 générique).
    - Aucun message ne relaie stacktrace, clé API ou prompt complet.
    """
    try:
        return extract_invoice_structure(payload)
    except MissingProviderKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Service d\'extraction structurée non configuré.',
        ) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Fournisseur LLM indisponible.',
        ) from exc
    except InvoiceExtractionError as exc:
        # OCR vide → 400, autre contrat violé → 502.
        message = str(exc)
        if message.startswith('OCR vide'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=message,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Réponse invalide du fournisseur LLM.',
        ) from exc
