"""Service IA Mizan — endpoints FastAPI.

Endpoints exposés :

- `GET  /health`                        : sonde publique du processus.
- `GET  /internal/health`               : sonde protégée (auth service-to-service).
- `POST /internal/ocr/extract-text`     : OCR pur d'une image ou d'un PDF
  (texte lu directement s'il y en a, sinon pages rendues puis OCR — protégé).
- `POST /internal/invoice/structure`    : proposition structurée d'une
  facture à partir d'une sortie OCR, via un LLM externe (protégé, POC 6A).
- `POST /internal/product-scan`         : lecture d'un emballage, face et dos
  facultatif (code-barres, OCR, structuration du texte seul par le
  fournisseur IA s'il est configuré — protégé, URS-109).
- `POST /internal/product-scan/vision`  : secours image de ce scan, appelé
  par Django seulement s'il le décide (quota, critère sémantique — protégé).

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

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status

from . import config
from .file_validation import FileValidationError, validate_product_image, validate_uploaded_document
from .image_prep import ImageDecodeError, check_image
from .invoice_extraction import (
    InvoiceExtractionError,
    MissingProviderKeyError,
    ProviderUnavailableError,
    extract_invoice_structure,
)
from .ocr import OcrEngineError, extract_text_from_image
from .pdf import extract_text_from_pdf
from .product_scan import VisionDisabledError, scan_locally, scan_with_vision
from .schemas import InvoiceExtraction, InvoiceStructureRequest, OcrExtractionResult, ProductScanLocalResult
from .security import require_internal_api_key
from .vision.base import ProductReading, VisionProviderError

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
    """Extrait le texte brut d'un document image (PaddleOCR) ou PDF.

    - Validation locale : taille, MIME, signature binaire ; pour une image,
      dimensions et intégrité ; pour un PDF, mot de passe, nombre et taille
      des pages à l'ouverture (400).
    - PDF : texte lu directement sur les pages qui en ont, les autres
      rendues en image puis passées au même OCR (voir `pdf.py`).
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

    if document.content_type == 'application/pdf':
        return _extract_pdf(content)

    # PaddleOCR décode l'image sans limite : une « bombe » de quelques Ko
    # occuperait plusieurs Go de mémoire.
    try:
        check_image(content)
    except ImageDecodeError as exc:
        raise _unreadable_image(exc) from exc

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


def _extract_pdf(content: bytes) -> OcrExtractionResult:
    try:
        return extract_text_from_pdf(content, read_image=extract_text_from_image)
    except FileValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except OcrEngineError as exc:
        logger.warning('OCR engine error: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Erreur interne du moteur OCR.',
        ) from exc


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


async def _read_product_image(image: UploadFile) -> bytes:
    content = await image.read()
    try:
        validate_product_image(content=content, content_type=image.content_type)
    except FileValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return content


def _unreadable_image(exc: ImageDecodeError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post(
    '/internal/product-scan',
    dependencies=[Depends(require_internal_api_key)],
    response_model=ProductScanLocalResult,
)
async def product_scan(
    image: UploadFile = File(...), image_back: UploadFile | None = File(None),
    structure: bool = Form(False),
) -> ProductScanLocalResult:
    """Lecture d'un emballage (face, dos facultatif) : code-barres, OCR, structuration.

    Seul le texte lu peut sortir (structuration, si un fournisseur est
    configuré) : jamais l'image. Elle n'est ni conservée ni journalisée ; le
    seul fichier temporaire (exigé par PaddleOCR) est supprimé dès la lecture finie.

    `structure` : demandée explicitement par Django, qui tient le plafond mensuel
    de la boutique. Absente ou fausse, le modèle n'est pas appelé (`skipped`) et
    les règles locales répondent : aucun appel payant sans place réservée.
    """
    face = await _read_product_image(image)
    back = await _read_product_image(image_back) if image_back is not None else None
    try:
        return scan_locally(face, back, structure=structure)
    except ImageDecodeError as exc:
        raise _unreadable_image(exc) from exc
    except OcrEngineError as exc:
        logger.warning('OCR engine error during product scan: %s', type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Erreur interne du moteur OCR.',
        ) from exc


@app.post(
    '/internal/product-scan/vision',
    dependencies=[Depends(require_internal_api_key)],
    response_model=ProductReading,
)
async def product_scan_vision(image: UploadFile = File(...)) -> ProductReading:
    """Secours image : photo de face réduite et sans métadonnées envoyée au fournisseur.

    - aucun fournisseur configuré, ou `PRODUCT_SCAN_IMAGE_FALLBACK` faux → 503
      (Django renvoie la lecture locale) ;
    - fournisseur en échec → 502 générique, détail dans les logs seulement.
    """
    content = await _read_product_image(image)
    try:
        return scan_with_vision(content)
    except ImageDecodeError as exc:
        raise _unreadable_image(exc) from exc
    except VisionDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Secours vision non configuré.',
        ) from exc
    except VisionProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Fournisseur de vision indisponible.',
        ) from exc
