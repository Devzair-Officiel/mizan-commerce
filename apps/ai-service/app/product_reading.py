"""Lecture structurée d'un emballage : assainissement, garde-fou et critère du secours image.

- `sanitize_reading` : réponse d'un fournisseur ramenée à des valeurs sûres
  (longueurs bornées, contenance normalisée, code-barres revérifié). Avec les
  lignes OCR, chaque valeur doit en plus s'appuyer sur le texte lu : un mot
  significatif ou un nombre absent de l'emballage fait écarter la valeur — le
  modèle peut corriger « ONGREDIENTS », pas inventer « déodorant ».
- `needs_vision` : critère sémantique du secours image (texte pauvre,
  désignation absente, égale à la marque, ou d'un seul mot sans type de produit).
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

from .barcode import is_valid_gtin
from .product_text import is_text_candidate, parse_net_quantity
from .vision.base import ProductReading, ScanTextLine

_MAX_NAME_LENGTH = 200
_MAX_PART_LENGTH = 120
_MAX_CLAIMS = 5
_MAX_CLAIM_LENGTH = 80
# Confiance retenue quand le fournisseur n'en donne pas.
_DEFAULT_CONFIDENCE = 0.6
# Un mot de moins de 4 lettres (« à », « de », « déo ») ne prouve rien.
_MIN_WORD_LENGTH = 4
# « ingrédients » / « ongredients » : 0,91 ; « déodorant » / « déo » : 0,5.
_WORD_MATCH_RATIO = 0.75
# En dessous, le texte lu ne suffit pas à reconnaître le produit.
_MIN_TEXT_LETTERS = 6

_WORD = re.compile(r'[^\W\d_]+')
_NUMBER = re.compile(r'\d+')

# Types de produit courants (normalisés : minuscules, sans accent). Liste courte
# à dessein : un mot absent ne fait que recommander le secours image.
_PRODUCT_TYPES = frozenset({
    'lait', 'miel', 'huile', 'savon', 'shampooing', 'shampoing', 'deodorant', 'creme', 'riz',
    'sucre', 'farine', 'semoule', 'couscous', 'pates', 'the', 'cafe', 'eau', 'jus', 'beurre',
    'fromage', 'yaourt', 'dattes', 'epices', 'sel', 'poivre', 'chocolat', 'biscuits', 'confiture',
    'vinaigre', 'harissa', 'moutarde', 'lessive', 'dentifrice', 'parfum', 'musc', 'henne',
    'encens', 'gel', 'lotion', 'baume', 'serum', 'masque', 'savonnette', 'olives', 'lentilles',
    'pois', 'haricots', 'thon', 'sardines', 'soda', 'limonade', 'sirop', 'bonbons', 'gateaux',
    'milk', 'honey', 'oil', 'soap', 'shampoo', 'tea', 'coffee', 'water', 'juice', 'butter',
    'cheese', 'rice', 'sugar', 'flour', 'dates', 'salt', 'cream', 'perfume',
    'حليب', 'عسل', 'زيت', 'صابون', 'شاي', 'قهوة', 'ماء', 'عصير', 'زبدة', 'جبن', 'ارز', 'سكر',
    'دقيق', 'تمر', 'ملح', 'كريم', 'عطر', 'مسك', 'حناء', 'بخور',
})


def normalize_text(text: str) -> str:
    """Minuscules, sans accent ni signe diacritique, espaces réduits."""
    decomposed = unicodedata.normalize('NFKD', text)
    stripped = ''.join(ch for ch in decomposed if not unicodedata.combining(ch))
    return ' '.join(stripped.casefold().split())


def _clean(value: str | None, max_length: int) -> str | None:
    text = ' '.join((value or '').split())
    return text[:max_length] if text else None


class _Evidence:
    """Mots et nombres lus sur l'emballage, contre lesquels on vérifie une valeur."""

    def __init__(self, lines: list[ScanTextLine]) -> None:
        texts = [normalize_text(line.text) for line in lines]
        self.words = {word for text in texts for word in _WORD.findall(text)}
        self.numbers = {number for text in texts for number in _NUMBER.findall(text)}
        self.digits = ''.join(ch for text in texts for ch in text if ch.isdigit())

    def _has_word(self, word: str) -> bool:
        return word in self.words or any(
            SequenceMatcher(None, word, known).ratio() >= _WORD_MATCH_RATIO for known in self.words
        )

    def supports(self, value: str) -> bool:
        text = normalize_text(value)
        words = [word for word in _WORD.findall(text) if len(word) >= _MIN_WORD_LENGTH]
        return all(self._has_word(word) for word in words) and all(
            number in self.numbers for number in _NUMBER.findall(text)
        )


def _supported(value: str | None, evidence: _Evidence | None) -> str | None:
    if value is None or evidence is None or evidence.supports(value):
        return value
    return None


def _clean_barcode(value: str | None, evidence: _Evidence | None) -> str | None:
    barcode = ''.join((value or '').split())[:14]
    if not barcode or not is_valid_gtin(barcode):
        return None
    return barcode if evidence is None or barcode in evidence.digits else None


def sanitize_reading(reading: ProductReading, lines: list[ScanTextLine] | None = None) -> ProductReading:
    """Valeurs sûres ; avec `lines`, toute valeur absente du texte lu est écartée."""
    evidence = _Evidence(lines) if lines is not None else None
    quantity = _clean(reading.net_quantity, 40)
    net_quantity = parse_net_quantity(quantity) if quantity else None
    claims = [
        claim for raw in (reading.claims or [])[:_MAX_CLAIMS]
        if (claim := _supported(_clean(raw, _MAX_CLAIM_LENGTH), evidence))
    ]
    confidence = reading.confidence if reading.confidence is not None else _DEFAULT_CONFIDENCE
    return ProductReading(
        brand=_supported(_clean(reading.brand, _MAX_PART_LENGTH), evidence),
        product_name=_supported(_clean(reading.product_name, _MAX_NAME_LENGTH), evidence),
        variant=_supported(_clean(reading.variant, _MAX_PART_LENGTH), evidence),
        claims=claims,
        net_quantity=_supported(net_quantity, evidence),
        barcode=_clean_barcode(reading.barcode, evidence),
        confidence=round(min(max(confidence, 0.0), 1.0), 3),
    )


def needs_vision(lines: list[ScanTextLine], product_name: str | None, brand: str | None) -> bool:
    """Le texte ne suffit pas à nommer le produit : le secours image aiderait."""
    letters = sum(ch.isalpha() for line in lines if is_text_candidate(line) for ch in line.text)
    if letters < _MIN_TEXT_LETTERS or not product_name:
        return True
    name = normalize_text(product_name)
    if brand and name == normalize_text(brand):
        return True
    words = _WORD.findall(name)
    return len(words) == 1 and words[0] not in _PRODUCT_TYPES
