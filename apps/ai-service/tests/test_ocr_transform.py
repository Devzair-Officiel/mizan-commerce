"""Tests unitaires de la transformation résultat PaddleOCR → contrat interne.

Ces tests n'ont *aucune* dépendance à PaddleOCR : on simule la structure de
retour attendue (`get('rec_texts')`, `get('rec_scores')`) via un simple dict.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.ocr import OcrEngineError, _coerce_bbox, _transform_result, extract_text_from_image


class _FakeResult(dict):
    """Simule un `OCRResult` PaddleOCR : accepte `.get('rec_texts')`, etc."""


def test_transform_nominal() -> None:
    raw = [_FakeResult(
        rec_texts=['ligne 1', 'ligne 2'],
        rec_scores=[0.8, 0.9],
        rec_boxes=[[10, 20, 100, 40], [10, 50, 120, 70]],
    )]
    result = _transform_result(raw)
    assert result.raw_text == 'ligne 1\nligne 2'
    assert [line.text for line in result.lines] == ['ligne 1', 'ligne 2']
    assert [line.confidence for line in result.lines] == [0.8, 0.9]
    assert [line.bbox for line in result.lines] == [
        [10, 20, 100, 40], [10, 50, 120, 70],
    ]
    assert result.confidence_score == pytest.approx(0.85)


def test_transform_empty_returns_zero_confidence() -> None:
    """Aucune ligne détectée : contrat explicite `confidence_score = 0.0`."""
    raw = [_FakeResult(rec_texts=[], rec_scores=[], rec_boxes=[])]
    result = _transform_result(raw)
    assert result.raw_text == ''
    assert result.lines == []
    assert result.confidence_score == 0.0


def test_transform_confidence_clamped_to_unit_interval() -> None:
    """Si Paddle renvoie un score hors [0, 1] (bug futur), on borne."""
    raw = [_FakeResult(
        rec_texts=['a', 'b'],
        rec_scores=[1.5, -0.3],
        rec_boxes=[[0, 0, 10, 10], [0, 0, 10, 10]],
    )]
    result = _transform_result(raw)
    assert [line.confidence for line in result.lines] == [1.0, 0.0]


def test_transform_handles_mismatched_length() -> None:
    """Si texts et scores n'ont pas la même longueur, on ne plante pas."""
    raw = [_FakeResult(rec_texts=['a', 'b', 'c'], rec_scores=[0.9], rec_boxes=[])]
    result = _transform_result(raw)
    # `zip(..., strict=False)` s'arrête à la plus courte.
    assert len(result.lines) == 1
    assert result.lines[0].text == 'a'


def test_transform_accepts_direct_dict_result() -> None:
    """Si un jour PaddleOCR retourne un objet nu au lieu d'une liste."""
    raw = _FakeResult(rec_texts=['solo'], rec_scores=[0.77], rec_boxes=[[1, 2, 3, 4]])
    result = _transform_result(raw)
    assert result.raw_text == 'solo'
    assert result.confidence_score == pytest.approx(0.77)
    assert result.lines[0].bbox == [1, 2, 3, 4]


def test_transform_tolerates_missing_rec_boxes() -> None:
    """Ancienne version ou sortie partielle : pas de `rec_boxes` → bbox vide."""
    raw = [_FakeResult(rec_texts=['a', 'b'], rec_scores=[0.8, 0.9])]
    result = _transform_result(raw)
    assert [line.text for line in result.lines] == ['a', 'b']
    assert [line.bbox for line in result.lines] == [[], []]


def test_transform_tolerates_fewer_boxes_than_texts() -> None:
    """Si Paddle renvoie moins de boxes que de textes, on garde tous les
    textes et on comble les bboxes manquantes par `[]`."""
    raw = [_FakeResult(
        rec_texts=['a', 'b', 'c'],
        rec_scores=[0.8, 0.9, 0.7],
        rec_boxes=[[1, 2, 3, 4]],
    )]
    result = _transform_result(raw)
    assert [line.text for line in result.lines] == ['a', 'b', 'c']
    assert [line.bbox for line in result.lines] == [[1, 2, 3, 4], [], []]


# ─── Normalisation défensive des bboxes ────────────────────────────────────


def test_coerce_bbox_rectangle_direct() -> None:
    assert _coerce_bbox([10, 20, 100, 40]) == [10, 20, 100, 40]


def test_coerce_bbox_rounds_floats() -> None:
    assert _coerce_bbox([10.4, 20.6, 100.5, 40.9]) == [10, 21, 100, 41]


def test_coerce_bbox_polygon_falls_back_to_bounding_rect() -> None:
    polygon = [[10, 20], [110, 22], [108, 60], [8, 58]]
    assert _coerce_bbox(polygon) == [8, 20, 110, 60]


def test_coerce_bbox_returns_empty_on_garbage() -> None:
    for garbage in (None, [], [1, 2, 3], 'oops', [[1]], [[1, 'x']]):
        assert _coerce_bbox(garbage) == []


# ─── Chargement du pipeline : erreur native → OcrEngineError ───────────────


def test_extract_text_wraps_engine_load_failure() -> None:
    """Si `_get_engine` lève (téléchargement modèle KO, incompatibilité,
    OSError disque plein…), on doit voir `OcrEngineError`, jamais
    l'exception native — l'endpoint compte dessus pour son 500 générique.
    """
    boom = RuntimeError('paddle native load boom')
    with patch('app.ocr._get_engine', side_effect=boom):
        with pytest.raises(OcrEngineError) as exc_info:
            extract_text_from_image('/tmp/unused.png')
    # Le message reste générique, la cause d'origine est préservée pour les logs.
    assert str(exc_info.value) == 'Échec du moteur OCR.'
    assert exc_info.value.__cause__ is boom
