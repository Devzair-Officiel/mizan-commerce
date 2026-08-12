"""Tests unitaires de la transformation résultat PaddleOCR → contrat interne.

Ces tests n'ont *aucune* dépendance à PaddleOCR : on simule la structure de
retour attendue (`get('rec_texts')`, `get('rec_scores')`) via un simple dict.
"""
from __future__ import annotations

import pytest

from app.ocr import _transform_result


class _FakeResult(dict):
    """Simule un `OCRResult` PaddleOCR : accepte `.get('rec_texts')`, etc."""


def test_transform_nominal() -> None:
    raw = [_FakeResult(rec_texts=['ligne 1', 'ligne 2'], rec_scores=[0.8, 0.9])]
    result = _transform_result(raw)
    assert result.raw_text == 'ligne 1\nligne 2'
    assert [line.text for line in result.lines] == ['ligne 1', 'ligne 2']
    assert [line.confidence for line in result.lines] == [0.8, 0.9]
    assert result.confidence_score == pytest.approx(0.85)


def test_transform_empty_returns_zero_confidence() -> None:
    """Aucune ligne détectée : contrat explicite `confidence_score = 0.0`."""
    raw = [_FakeResult(rec_texts=[], rec_scores=[])]
    result = _transform_result(raw)
    assert result.raw_text == ''
    assert result.lines == []
    assert result.confidence_score == 0.0


def test_transform_confidence_clamped_to_unit_interval() -> None:
    """Si Paddle renvoie un score hors [0, 1] (bug futur), on borne."""
    raw = [_FakeResult(rec_texts=['a', 'b'], rec_scores=[1.5, -0.3])]
    result = _transform_result(raw)
    assert [line.confidence for line in result.lines] == [1.0, 0.0]


def test_transform_handles_mismatched_length() -> None:
    """Si texts et scores n'ont pas la même longueur, on ne plante pas."""
    raw = [_FakeResult(rec_texts=['a', 'b', 'c'], rec_scores=[0.9])]
    result = _transform_result(raw)
    # `zip(..., strict=False)` s'arrête à la plus courte.
    assert len(result.lines) == 1
    assert result.lines[0].text == 'a'


def test_transform_accepts_direct_dict_result() -> None:
    """Si un jour PaddleOCR retourne un objet nu au lieu d'une liste."""
    raw = _FakeResult(rec_texts=['solo'], rec_scores=[0.77])
    result = _transform_result(raw)
    assert result.raw_text == 'solo'
    assert result.confidence_score == pytest.approx(0.77)
