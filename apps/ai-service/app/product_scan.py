"""Scan d'emballage : lecture locale, puis secours vision sur demande de Django.

- `scan_locally` : code-barres (zxing-cpp) puis OCR (PaddleOCR) sur une copie
  réduite et sans métadonnées. Le fichier temporaire exigé par PaddleOCR est
  supprimé dès la lecture finie, même en cas d'erreur.
- `scan_with_vision` : envoie la même copie nettoyée au fournisseur configuré
  et assainit sa réponse (code-barres revérifié, contenance normalisée).

Rien n'est journalisé du contenu : ni image, ni texte lu, ni réponse.
"""
from __future__ import annotations

import os
import tempfile

from .barcode import decode_barcode, is_valid_gtin
from .image_prep import open_image, prepare_for_provider
from .ocr import extract_text_from_image
from .product_text import parse_net_quantity, propose_from_ocr
from .schemas import OcrLine, ProductScanLocalResult, ScanFieldProposal
from .vision.base import ProductVisionResult, VisionProviderError
from .vision.registry import get_provider

# zxing vérifie déjà la clé de contrôle : un code lu est sûr.
_BARCODE_CONFIDENCE = 1.0
_MAX_NAME_LENGTH = 200
_MAX_TEXT_LENGTH = 300
# Confiance retenue quand le fournisseur n'en donne pas.
_DEFAULT_VISION_CONFIDENCE = 0.6


class VisionDisabledError(RuntimeError):
    """Aucun fournisseur configuré (`none`, inconnu ou clé absente)."""


def _ocr(jpeg: bytes) -> list[OcrLine]:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
    try:
        tmp.write(jpeg)
        tmp.close()
        return extract_text_from_image(tmp.name).lines
    finally:
        try:
            os.unlink(tmp.name)
        except FileNotFoundError:
            pass


def scan_locally(content: bytes) -> ProductScanLocalResult:
    """Code-barres puis OCR. Lève `ImageDecodeError` ou `OcrEngineError`."""
    image = open_image(content)
    barcode = decode_barcode(image)
    proposals = propose_from_ocr(_ocr(prepare_for_provider(image)))
    return ProductScanLocalResult(
        barcode=ScanFieldProposal(value=barcode.value, confidence=_BARCODE_CONFIDENCE) if barcode else None,
        barcode_format=barcode.format if barcode else None,
        name=proposals.name,
        brand=proposals.brand,
        net_quantity=proposals.net_quantity,
        description=proposals.description,
        vision_available=get_provider() is not None,
    )


def _clean(value: str | None, max_length: int) -> str | None:
    text = ' '.join((value or '').split())
    return text[:max_length] if text else None


def _sanitize(result: ProductVisionResult) -> ProductVisionResult:
    """Réponse du fournisseur ramenée à des valeurs sûres ; le doute donne `null`."""
    barcode = _clean(result.barcode, 14)
    quantity = _clean(result.net_quantity, 40)
    unit = _clean(result.unit, 10)
    if quantity and unit and parse_net_quantity(quantity) is None:
        quantity = f'{quantity} {unit}'
    net_quantity = parse_net_quantity(quantity) if quantity else None
    confidence = result.confidence if result.confidence is not None else _DEFAULT_VISION_CONFIDENCE
    return ProductVisionResult(
        name=_clean(result.name, _MAX_NAME_LENGTH),
        brand=_clean(result.brand, _MAX_NAME_LENGTH),
        net_quantity=net_quantity,
        unit=net_quantity.rsplit(' ', 1)[1] if net_quantity else None,
        barcode=barcode if barcode and is_valid_gtin(barcode) else None,
        description=_clean(result.description, _MAX_TEXT_LENGTH),
        confidence=round(min(max(confidence, 0.0), 1.0), 3),
    )


def scan_with_vision(content: bytes) -> ProductVisionResult:
    """Secours vision. Lève `VisionDisabledError`, `VisionProviderError` ou `ImageDecodeError`."""
    provider = get_provider()
    if provider is None:
        raise VisionDisabledError('Secours vision non configuré.')
    jpeg = prepare_for_provider(open_image(content))
    result = provider.extract(jpeg, 'image/jpeg')
    if not isinstance(result, ProductVisionResult):
        raise VisionProviderError('Réponse invalide du fournisseur de vision.')
    return _sanitize(result)

