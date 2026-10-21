"""Scan d'emballage : lecture locale (une ou deux photos), puis secours image sur demande de Django.

- `scan_locally` : pour chaque photo (face, puis dos facultatif), code-barres
  (zxing-cpp) puis OCR (PaddleOCR) sur une copie réduite et sans métadonnées.
  Toutes les lignes lues partent ensuite à la structuration (texte seul, aucune
  image) si un fournisseur est configuré ; sinon, ou s'il échoue, les règles de
  `product_text.py` prennent le relais. Le fichier temporaire exigé par
  PaddleOCR est supprimé dès la lecture finie, même en cas d'erreur.
- `scan_with_vision` : envoie la copie nettoyée de la face au fournisseur, si
  `PRODUCT_SCAN_IMAGE_FALLBACK` l'autorise, et assainit sa réponse.

Rien n'est journalisé du contenu : ni image, ni texte lu, ni réponse.
"""
from __future__ import annotations

import os
import tempfile

from . import config
from .barcode import DetectedBarcode, decode_barcode
from .image_prep import open_image, prepare_for_provider
from .ocr import extract_text_from_image
from .product_reading import needs_vision, sanitize_reading
from .product_text import propose_from_ocr
from .schemas import OcrLine, ProductScanLocalResult, ScanFieldProposal
from .vision.base import ProductReading, ProductVisionProvider, ScanSide, ScanTextLine, VisionProviderError
from .vision.registry import get_provider

# zxing vérifie déjà la clé de contrôle : un code lu est sûr.
_BARCODE_CONFIDENCE = 1.0
# Une lecture de modèle reste sous le code-barres et Open Food Facts (0,9).
_MODEL_CONFIDENCE_CAP = 0.85


class VisionDisabledError(RuntimeError):
    """Secours image indisponible : aucun fournisseur, ou `PRODUCT_SCAN_IMAGE_FALLBACK` faux."""


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


def _read_photo(content: bytes, side: ScanSide) -> tuple[DetectedBarcode | None, list[ScanTextLine]]:
    image = open_image(content)
    lines = _ocr(prepare_for_provider(image))
    return decode_barcode(image), [
        ScanTextLine(text=line.text, confidence=line.confidence, bbox=line.bbox, side=side) for line in lines
    ]


def _proposal(value: str | None, confidence: float) -> ScanFieldProposal | None:
    return ScanFieldProposal(value=value, confidence=confidence) if value else None


def _structure(provider: ProductVisionProvider | None, lines: list[ScanTextLine]) -> tuple[ProductReading | None, str]:
    """Structuration du texte : (lecture assainie, 'done') ou (None, 'disabled' | 'failed')."""
    if provider is None:
        return None, 'disabled'
    try:
        reading = provider.structure(lines)
    except VisionProviderError:
        return None, 'failed'
    if not isinstance(reading, ProductReading):
        return None, 'failed'
    return sanitize_reading(reading, lines), 'done'


def _model_fields(reading: ProductReading) -> dict[str, object]:
    confidence = min(reading.confidence or 0.0, _MODEL_CONFIDENCE_CAP)
    return {
        'brand': _proposal(reading.brand, confidence),
        'product_name': _proposal(reading.product_name, confidence),
        'variant': _proposal(reading.variant, confidence),
        'claims': [ScanFieldProposal(value=claim, confidence=confidence) for claim in reading.claims or []],
        'net_quantity': _proposal(reading.net_quantity, confidence),
        'barcode': _proposal(reading.barcode, confidence),
    }


def _rule_fields(lines: list[ScanTextLine]) -> dict[str, object]:
    proposals = propose_from_ocr(lines)
    return {'brand': proposals.brand, 'product_name': proposals.product_name, 'net_quantity': proposals.net_quantity}


def scan_locally(face: bytes, back: bytes | None = None, *, structure: bool = False) -> ProductScanLocalResult:
    """Code-barres, OCR et, si `structure`, structuration. Lève `ImageDecodeError` ou `OcrEngineError`."""
    barcode: DetectedBarcode | None = None
    lines: list[ScanTextLine] = []
    for side, content in (('face', face), ('back', back)):
        if content is None:
            continue
        found, side_lines = _read_photo(content, side)
        barcode = barcode or found
        lines.extend(side_lines)

    provider = get_provider()
    if structure or provider is None:
        reading, structuring = _structure(provider, lines)
    else:
        reading, structuring = None, 'skipped'
    fields = _model_fields(reading) if reading is not None else _rule_fields(lines)
    if barcode is not None:
        fields['barcode'] = ScanFieldProposal(value=barcode.value, confidence=_BARCODE_CONFIDENCE)
    name, brand = fields.get('product_name'), fields.get('brand')
    return ProductScanLocalResult(
        **fields,
        barcode_format=barcode.format if barcode else None,
        structuring=structuring,
        vision_recommended=needs_vision(
            lines,
            name.value if isinstance(name, ScanFieldProposal) else None,
            brand.value if isinstance(brand, ScanFieldProposal) else None,
        ),
        vision_available=provider is not None and config.PRODUCT_SCAN_IMAGE_FALLBACK,
    )


def scan_with_vision(content: bytes) -> ProductReading:
    """Secours image. Lève `VisionDisabledError`, `VisionProviderError` ou `ImageDecodeError`."""
    provider = get_provider() if config.PRODUCT_SCAN_IMAGE_FALLBACK else None
    if provider is None:
        raise VisionDisabledError('Secours vision non configuré.')
    jpeg = prepare_for_provider(open_image(content))
    result = provider.extract(jpeg, 'image/jpeg')
    if not isinstance(result, ProductReading):
        raise VisionProviderError('Réponse invalide du fournisseur de vision.')
    return sanitize_reading(result)
