"""Lecture du code-barres d'un emballage (zxing-cpp).

Formats retenus : ceux qui portent un GTIN de produit de consommation —
EAN-13, EAN-8, UPC-A (GTIN-12), UPC-E (développé en UPC-A par zxing) et
ITF-14 (GTIN-14 des cartons). Tout autre symbole (QR code, Code 128…) est
ignoré : il ne renvoie pas à une fiche produit.

La clé de contrôle est revérifiée ici même si zxing la contrôle déjà : le
backend Django la revérifie encore avant toute recherche externe (défense
en profondeur, les services ne se font pas confiance).
"""
from __future__ import annotations

from dataclasses import dataclass

import zxingcpp
from PIL import Image

_FORMATS = (
    zxingcpp.BarcodeFormat.EAN13,
    zxingcpp.BarcodeFormat.EAN8,
    zxingcpp.BarcodeFormat.UPCA,
    zxingcpp.BarcodeFormat.UPCE,
    zxingcpp.BarcodeFormat.ITF14,
)

GTIN_LENGTHS: frozenset[int] = frozenset({8, 12, 13, 14})


@dataclass(frozen=True)
class DetectedBarcode:
    value: str
    format: str


def is_valid_gtin(value: str) -> bool:
    """Chiffres seuls, longueur GTIN, clé de contrôle modulo 10 (GS1)."""
    if not value.isascii() or not value.isdigit() or len(value) not in GTIN_LENGTHS:
        return False
    body, check = value[:-1], int(value[-1])
    # Poids 3 sur le chiffre le plus proche de la clé, puis alternance 1/3.
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def decode_barcode(image: Image.Image) -> DetectedBarcode | None:
    """Premier GTIN valide lu sur l'image, ou `None`."""
    for result in zxingcpp.read_barcodes(image, formats=_FORMATS):
        value = result.text.strip()
        if result.valid and is_valid_gtin(value):
            return DetectedBarcode(value=value, format=str(result.format))
    return None
