"""Lecture par règles du texte OCR d'un emballage (sans fournisseur IA).

Repli de la structuration (`product_reading.py`) : utilisé quand aucun
fournisseur n'est configuré ou qu'il échoue. Heuristiques volontairement
prudentes, chacune avec sa confiance :
- contenance nette : expressions régulières (« 250 ml », « 1,5 L », « 6 x 33 cl ») ;
- désignation : la ligne de la face écrite en plus gros caractères (hauteur de
  bbox), plus sûre quand elle domine nettement les autres — souvent la marque,
  d'où le critère sémantique de `product_reading.needs_vision` ;
- marque : une ligne portant ® ou ™.
Ni variante ni allégations : les règles ne savent pas les reconnaître, et la
description ne reçoit jamais la désignation.

Ce module ne fait que proposer : le backend écarte les valeurs trop
incertaines et l'utilisateur relit tout avant d'enregistrer.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .schemas import ScanFieldProposal
from .vision.base import ScanTextLine

_NUMBER = r'\d{1,4}(?:[.,]\d{1,3})?'
_UNIT = (
    r'(?P<unit>kg|mg|g|gr|grammes?|grams?|ml|cl|dl|l|litres?|liters?|fl\.?\s?oz|oz|lbs?)'
)
_MULTIPACK = re.compile(
    rf'(?<![\d.,])(?P<count>\d{{1,3}})\s*[x×X*]\s*(?P<qty>{_NUMBER})\s*{_UNIT}(?![a-z])',
    re.IGNORECASE,
)
_SINGLE = re.compile(rf'(?<![\d.,])(?P<qty>{_NUMBER})\s*{_UNIT}(?![a-z])', re.IGNORECASE)

_UNIT_LABELS: dict[str, str] = {
    'kg': 'kg', 'mg': 'mg', 'g': 'g', 'gr': 'g', 'gramme': 'g', 'grammes': 'g',
    'gram': 'g', 'grams': 'g', 'ml': 'ml', 'cl': 'cl', 'dl': 'dl', 'l': 'L',
    'litre': 'L', 'litres': 'L', 'liter': 'L', 'liters': 'L', 'oz': 'oz',
    'lb': 'lb', 'lbs': 'lb',
}
# Mention de contenance : la ligne qui la porte l'emporte sur les autres.
_NET_KEYWORDS = re.compile(r'\b(net|poids|contenance|volume|e\b|℮)', re.IGNORECASE)
# « Valeurs nutritionnelles pour 100 g » n'est pas une contenance.
_PER_PORTION = re.compile(r'\b(pour|per|par|for|/)\s*$', re.IGNORECASE)

# Lignes jamais retenues comme désignation.
_BOILERPLATE = re.compile(
    r'(ingr[ée]dients?|consommer|best before|lot\b|www\.|https?:|@|\bdlc\b|\bddm\b|'
    r'valeurs? nutritionnelles?|nutrition|conserver|store|fabriqu[ée]|made in|'
    r'\d{1,3}\s?%|kcal|kj\b)',
    re.IGNORECASE,
)
_TRADEMARK = re.compile(r'[®™]')

# Ligne « dominante » : sa hauteur dépasse d'au moins 50 % celle de la suivante.
_DOMINANT_RATIO = 1.5
_NAME_FACTOR_DOMINANT = 0.85
_NAME_FACTOR_DEFAULT = 0.6
_BRAND_FACTOR = 0.8
_QUANTITY_FACTOR_KEYWORD = 0.9
_QUANTITY_FACTOR_DEFAULT = 0.75
_MIN_LINE_CONFIDENCE = 0.6
_MAX_NAME_LENGTH = 80


@dataclass(frozen=True)
class OcrProposals:
    product_name: ScanFieldProposal | None
    brand: ScanFieldProposal | None
    net_quantity: ScanFieldProposal | None


def _unit_label(raw: str) -> str:
    key = re.sub(r'[\s.]', '', raw.lower())
    return 'fl oz' if key == 'floz' else _UNIT_LABELS[key]


def parse_net_quantity(text: str) -> str | None:
    """Contenance nette normalisée lue dans `text` (« 6 x 33 cl », « 1,5 L »), ou `None`."""
    multipack = _MULTIPACK.search(text)
    if multipack:
        return f"{multipack['count']} x {multipack['qty']} {_unit_label(multipack['unit'])}"
    for match in _SINGLE.finditer(text):
        if _PER_PORTION.search(text[:match.start()]):
            continue
        return f"{match['qty']} {_unit_label(match['unit'])}"
    return None


def _height(line: ScanTextLine) -> int:
    return line.bbox[3] - line.bbox[1] if len(line.bbox) == 4 else 0


def _confidence(base: float, factor: float) -> float:
    return round(min(max(base * factor, 0.0), 1.0), 3)


def _find_net_quantity(lines: list[ScanTextLine]) -> ScanFieldProposal | None:
    found = [(line, value) for line in lines if (value := parse_net_quantity(line.text))]
    if not found:
        return None
    keyword = [pair for pair in found if _NET_KEYWORDS.search(pair[0].text)]
    line, value = keyword[0] if keyword else max(found, key=lambda pair: _height(pair[0]))
    factor = _QUANTITY_FACTOR_KEYWORD if keyword else _QUANTITY_FACTOR_DEFAULT
    return ScanFieldProposal(value=value, confidence=_confidence(line.confidence, factor))


def is_text_candidate(line: ScanTextLine) -> bool:
    text = line.text.strip()
    letters = sum(ch.isalpha() for ch in text)
    return (
        line.confidence >= _MIN_LINE_CONFIDENCE
        and letters >= 2
        and letters >= len(text) / 2
        and parse_net_quantity(text) is None
        and not _BOILERPLATE.search(text)
    )


def _find_brand(candidates: list[ScanTextLine]) -> tuple[ScanTextLine | None, ScanFieldProposal | None]:
    for line in candidates:
        if _TRADEMARK.search(line.text):
            value = _TRADEMARK.sub('', line.text).strip()
            if value:
                return line, ScanFieldProposal(value=value, confidence=_confidence(line.confidence, _BRAND_FACTOR))
    return None, None


def propose_from_ocr(lines: list[ScanTextLine]) -> OcrProposals:
    """Désignation (face), marque et contenance (les deux côtés) proposées par règles."""
    net_quantity = _find_net_quantity(lines)
    candidates = sorted((line for line in lines if is_text_candidate(line)), key=_height, reverse=True)
    brand_line, brand = _find_brand(candidates)
    rest = [
        line for line in candidates
        if line is not brand_line and line.side == 'face' and len(line.text.strip()) <= _MAX_NAME_LENGTH
    ]

    product_name = None
    if rest:
        first = rest[0]
        second_height = _height(rest[1]) if len(rest) > 1 else 0
        dominant = _height(first) > 0 and (second_height == 0 or _height(first) >= _DOMINANT_RATIO * second_height)
        factor = _NAME_FACTOR_DOMINANT if dominant else _NAME_FACTOR_DEFAULT
        product_name = ScanFieldProposal(value=first.text.strip(), confidence=_confidence(first.confidence, factor))
    return OcrProposals(product_name=product_name, brand=brand, net_quantity=net_quantity)
