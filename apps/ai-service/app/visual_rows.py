"""Reconstruction déterministe des lignes visuelles depuis les bboxes OCR.

PaddleOCR renvoie ses blocs dans l'ordre de détection, pas dans l'ordre de
lecture du document. Sur une facture tabulaire dense, une même ligne visuelle
peut être coupée en plusieurs blocs OCR non consécutifs — ce qui fait perdre
au LLM l'alignement colonnes ↔ ligne (bug 6A observé : 18 lignes métier ont
produit 20 `InvoiceLineExtraction`).

Ce module reconstruit une géométrie 2D minimale à partir des bboxes, sans
aucune dépendance nouvelle, sans clustering, et *sans hardcoder les colonnes* :
il ignore la sémantique (référence, prix, quantité…) et se limite à
regrouper les blocs par bande horizontale, puis à les trier gauche → droite.

Algorithme (déterministe, O(n log n)) :

1. Ne conserver que les blocs dont la bbox est `[x_min, y_min, x_max, y_max]`
   avec une hauteur strictement positive. Les autres (bbox vide ou malformée,
   hauteur ≤ 0) sont ignorés ici — ils restent dans `raw_ocr_lines`.
2. Trier les blocs restants par `center_y` croissant (haut → bas).
3. Regrouper chaque bloc avec la dernière ligne ouverte si :

       abs(center_y - row_center_y) <= 0.5 * max(bloc_height, row_avg_height)

   où `row_center_y` et `row_avg_height` sont les moyennes glissantes de la
   ligne en cours de construction. Le facteur `0.5` est empirique mais
   suffisant sur les factures A4 typiques : deux lignes distinctes d'un
   tableau sont séparées d'au moins une hauteur de bloc.
4. À l'intérieur d'une ligne, trier les blocs par `x_min` croissant.

Chaque cellule conserve son **index OCR original** dans `request.lines` : ce
module ne renumérote rien, pour que `source_line_indices` reste fiable côté
LLM et côté revue humaine.
"""
from __future__ import annotations

from .schemas import OcrLine


def _valid_bbox(bbox: list[int]) -> tuple[int, int, int, int] | None:
    """Retourne `(x_min, y_min, x_max, y_max)` si la bbox est utilisable, sinon `None`.

    Une bbox est utilisable si :
    - elle a exactement 4 composantes numériques ;
    - `y_max > y_min` (hauteur strictement positive) — un bloc de hauteur
      nulle ou négative n'a pas de centre défini ni de tolérance calculable.
    On accepte `x_max <= x_min` (rare mais non bloquant : on n'ordonne que
    sur `x_min` à l'intérieur d'une ligne).
    """
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x_min, y_min, x_max, y_max = (int(v) for v in bbox)
    except (TypeError, ValueError):
        return None
    if y_max <= y_min:
        return None
    return x_min, y_min, x_max, y_max


def build_visual_rows(lines: list[OcrLine]) -> list[list[int]]:
    """Reconstruit les lignes visuelles d'un document OCR.

    Retourne une liste de lignes visuelles, chacune contenant les *indices
    originaux* (dans `lines`) des blocs qui la composent, triés
    gauche → droite. Les blocs sans bbox exploitable sont absents.

    La sortie est déterministe : deux appels avec la même entrée renvoient
    strictement la même structure.
    """
    valid: list[tuple[int, int, float, int]] = []  # (idx, x_min, center_y, height)
    for idx, line in enumerate(lines):
        parsed = _valid_bbox(line.bbox)
        if parsed is None:
            continue
        x_min, y_min, _x_max, y_max = parsed
        height = y_max - y_min
        center_y = (y_min + y_max) / 2
        valid.append((idx, x_min, center_y, height))

    # Tri haut → bas — condition nécessaire pour ne comparer qu'à la ligne
    # ouverte la plus récente lors du regroupement.
    valid.sort(key=lambda t: (t[2], t[0]))

    rows: list[dict] = []
    for idx, x_min, center_y, height in valid:
        merged = False
        if rows:
            row = rows[-1]
            row_center_y = row['sum_cy'] / row['count']
            row_avg_height = row['sum_h'] / row['count']
            tolerance = 0.5 * max(height, row_avg_height)
            if abs(center_y - row_center_y) <= tolerance:
                row['members'].append((idx, x_min))
                row['sum_cy'] += center_y
                row['sum_h'] += height
                row['count'] += 1
                merged = True
        if not merged:
            rows.append({
                'members': [(idx, x_min)],
                'sum_cy': center_y,
                'sum_h': float(height),
                'count': 1,
            })

    # Tri gauche → droite à l'intérieur de chaque ligne. En cas d'égalité
    # sur `x_min` (colonnes accolées), on retombe sur l'index original pour
    # rester déterministe.
    return [
        [idx for idx, _x in sorted(row['members'], key=lambda t: (t[1], t[0]))]
        for row in rows
    ]
