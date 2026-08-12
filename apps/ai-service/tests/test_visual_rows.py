"""Tests de la reconstruction déterministe des lignes visuelles.

Contexte : bug 6A observé sur facture dense — 148 blocs OCR, mais l'ordre
brut mélange les cellules d'une même ligne du tableau, et le LLM produit
alors 20 `InvoiceLineExtraction` pour 18 lignes métier. On teste ici
uniquement la reconstruction géométrique (`build_visual_rows`) : aucune
sémantique métier, aucun appel LLM.
"""
from __future__ import annotations

from app.schemas import OcrLine
from app.visual_rows import _valid_bbox, build_visual_rows


def _line(text: str, bbox: list[int], confidence: float = 0.95) -> OcrLine:
    return OcrLine(text=text, confidence=confidence, bbox=bbox)


# ─── Régression 6A — l'ordre OCR mélange les cellules d'une même ligne ────


def test_regression_reorders_scrambled_table_row_by_x() -> None:
    """Reproduction du bug 6A : cinq cellules d'une même ligne y=100 arrivent
    dans un ordre OCR incohérent. La reconstruction doit rétablir l'ordre
    visuel gauche → droite en conservant les indices ORIGINAUX.
    """
    lines = [
        _line('OCR-005', [400, 95, 470, 115]),                    # colonne réf
        _line('4', [520, 95, 545, 115]),                          # colonne qté
        _line('22,50 €', [580, 95, 650, 115]),                    # colonne PU
        _line('90,00 €', [700, 95, 770, 115]),                    # colonne total
        _line('Extraction numéro facture', [50, 95, 380, 115]),   # colonne desc
    ]
    rows = build_visual_rows(lines)
    assert rows == [[4, 0, 1, 2, 3]]


# ─── Regroupement / séparation Y ──────────────────────────────────────────


def test_two_rows_at_distinct_y_do_not_merge() -> None:
    """Deux lignes distantes verticalement doivent rester séparées."""
    lines = [
        _line('desc1', [50, 100, 200, 120]),
        _line('prix1', [300, 100, 380, 120]),
        _line('desc2', [50, 160, 200, 180]),
        _line('prix2', [300, 160, 380, 180]),
    ]
    rows = build_visual_rows(lines)
    assert rows == [[0, 1], [2, 3]]


def test_multiple_cells_same_row_sorted_left_to_right() -> None:
    lines = [
        _line('C', [400, 100, 450, 120]),
        _line('A', [50, 100, 100, 120]),
        _line('B', [200, 100, 250, 120]),
    ]
    rows = build_visual_rows(lines)
    assert rows == [[1, 2, 0]]


def test_already_correctly_ordered_input_stays_correct() -> None:
    lines = [
        _line('A', [50, 100, 100, 120]),
        _line('B', [200, 100, 250, 120]),
        _line('C', [400, 100, 450, 120]),
    ]
    rows = build_visual_rows(lines)
    assert rows == [[0, 1, 2]]


def test_rows_are_ordered_top_to_bottom() -> None:
    """Deux lignes reçues dans l'ordre bas → haut ressortent haut → bas."""
    lines = [
        _line('bottom', [50, 300, 200, 320]),
        _line('top', [50, 100, 200, 120]),
    ]
    rows = build_visual_rows(lines)
    assert rows == [[1], [0]]


def test_reasonable_height_variation_stays_in_same_row() -> None:
    """Une cellule plus haute (chiffre gras, symbole €) reste alignée si son
    centre Y est proche du centre de la ligne."""
    lines = [
        _line('desc', [50, 100, 200, 120]),           # h=20, cy=110
        _line('prix', [300, 95, 380, 125]),           # h=30, cy=110 → même ligne
    ]
    rows = build_visual_rows(lines)
    assert rows == [[0, 1]]


def test_far_center_y_creates_new_row_even_with_similar_height() -> None:
    """Si |Δ center_y| dépasse 0.5 * max(hauteurs), on ouvre une nouvelle ligne."""
    lines = [
        _line('a', [50, 100, 200, 120]),   # cy=110, h=20
        _line('b', [50, 140, 200, 160]),   # cy=150, h=20 → Δ=40 > 10
    ]
    rows = build_visual_rows(lines)
    assert rows == [[0], [1]]


def test_stable_deterministic_output_on_repeated_calls() -> None:
    """Deux appels avec la même entrée doivent renvoyer strictement la même sortie."""
    lines = [
        _line('C', [400, 100, 450, 120]),
        _line('A', [50, 100, 100, 120]),
        _line('B', [200, 100, 250, 120]),
        _line('D', [50, 200, 100, 220]),
    ]
    assert build_visual_rows(lines) == build_visual_rows(lines)


# ─── Bboxes invalides — tolérance sans crash ──────────────────────────────


def test_lines_without_bbox_are_excluded_without_crash() -> None:
    """Une ligne sans bbox n'est pas inventée dans une visual row."""
    lines = [
        _line('good', [50, 100, 200, 120]),
        _line('no bbox', []),
    ]
    rows = build_visual_rows(lines)
    assert rows == [[0]]


def test_malformed_bboxes_are_excluded() -> None:
    """Bboxes de mauvaise arité ou de hauteur nulle : ignorées silencieusement."""
    lines = [
        _line('short', [1, 2, 3]),            # 3 valeurs
        _line('flat', [10, 100, 200, 100]),   # y_max == y_min
        _line('inverted', [10, 120, 200, 100]),  # y_max < y_min
        _line('ok', [50, 200, 200, 220]),
    ]
    rows = build_visual_rows(lines)
    assert rows == [[3]]


def test_all_bboxes_invalid_returns_empty() -> None:
    lines = [_line('a', []), _line('b', [1, 2, 3])]
    assert build_visual_rows(lines) == []


def test_empty_input_returns_empty() -> None:
    assert build_visual_rows([]) == []


def test_original_indices_are_preserved_even_when_some_lines_excluded() -> None:
    """Les indices restent ceux de `lines`, pas des blocs valides."""
    lines = [
        _line('no bbox', []),                          # idx 0 — exclu
        _line('a', [50, 100, 100, 120]),               # idx 1
        _line('bad', [1, 2, 3]),                       # idx 2 — exclu
        _line('b', [200, 100, 250, 120]),              # idx 3
    ]
    rows = build_visual_rows(lines)
    assert rows == [[1, 3]]


# ─── Helper _valid_bbox ───────────────────────────────────────────────────


def test_valid_bbox_accepts_positive_height() -> None:
    assert _valid_bbox([10, 20, 100, 40]) == (10, 20, 100, 40)


def test_valid_bbox_rejects_wrong_arity() -> None:
    assert _valid_bbox([1, 2, 3]) is None
    assert _valid_bbox([1, 2, 3, 4, 5]) is None


def test_valid_bbox_rejects_zero_or_negative_height() -> None:
    assert _valid_bbox([10, 20, 100, 20]) is None
    assert _valid_bbox([10, 40, 100, 20]) is None


def test_valid_bbox_rejects_non_numeric() -> None:
    assert _valid_bbox([10, 20, 'oops', 40]) is None  # type: ignore[list-item]
    assert _valid_bbox(None) is None  # type: ignore[arg-type]
