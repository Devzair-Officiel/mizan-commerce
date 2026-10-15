"""Lecture d'une facture PDF — texte lu directement, ou rendu en image puis OCR.

Page par page :

- la page contient du texte (PDF généré par un logiciel de facturation) :
  les caractères sont regroupés en blocs, comme les blocs d'un OCR (une
  cellule de tableau, une ligne de texte), avec une confiance de 1.0 — plus
  fiable que l'OCR ;
- la page n'en contient pas (PDF scanné) : elle est rendue en image puis
  passée à l'OCR existant (`extract_text_from_image`).

Les bboxes sont ramenées dans un même repère que celui d'une photo :
pixels, origine en haut à gauche, les pages empilées verticalement. Le
regroupement en lignes visuelles (`visual_rows.py`) et la structuration
s'appliquent donc sans changement.

PDFium (via `pypdfium2`, roue autonome sans dépendance système) n'est pas
thread-safe : tout accès passe par `_pdfium_lock`.
"""
from __future__ import annotations

import logging
import os
import tempfile
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from .file_validation import FileValidationError
from .ocr import OcrEngineError
from .schemas import OcrExtractionResult, OcrLine

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)

# Cohérence avec `OCR_PDF_MAX_PAGES` côté backend Django (duplication assumée,
# comme pour la taille : les deux services valident indépendamment).
MAX_PDF_PAGES: int = 5

# Résolution de rendu d'une page scannée : 200 dpi suffisent à PaddleOCR sur
# du texte de facture. Le côté le plus long est borné pour qu'une page géante
# (affiche, plan) ne produise pas une image de plusieurs centaines de Mo.
_POINTS_PER_INCH = 72
_RENDER_DPI = 200
_MAX_RENDER_SIDE_PX = 4000

# En dessous, la page est traitée comme scannée : un simple numéro de page ou
# un tampon texte posé sur un scan ne doit pas masquer le reste de l'image.
_MIN_TEXT_CHARS = 20

# Écart horizontal au-delà duquel deux caractères d'une même ligne appartiennent
# à deux blocs, en hauteurs de ligne : l'espace entre deux mots en fait environ
# 0,35, celui entre deux cellules d'un tableau 2 ou plus.
_MAX_WORD_GAP = 1.0

_pdfium_lock = threading.Lock()


def _page_scale(width_pt: float, height_pt: float) -> float:
    scale = _RENDER_DPI / _POINTS_PER_INCH
    longest = max(width_pt, height_pt) * scale
    if longest > _MAX_RENDER_SIDE_PX:
        scale *= _MAX_RENDER_SIDE_PX / longest
    return scale


def _open_document(content: bytes) -> pdfium.PdfDocument:
    """Ouvre le PDF ; mot de passe, contenu illisible ou trop de pages → 400."""
    try:
        document = pdfium.PdfDocument(content)
    except pdfium.PdfiumError as exc:
        if exc.err_code == pdfium_c.FPDF_ERR_PASSWORD:
            raise FileValidationError('PDF protégé par mot de passe.') from exc
        raise FileValidationError('PDF illisible.') from exc
    if len(document) == 0:
        document.close()
        raise FileValidationError('PDF illisible.')
    if len(document) > MAX_PDF_PAGES:
        document.close()
        raise FileValidationError(f'PDF trop long ({MAX_PDF_PAGES} pages au maximum).')
    return document


@dataclass
class _Block:
    """Bloc de texte en cours, en points PDF (origine en bas à gauche)."""

    text: str
    left: float
    bottom: float
    right: float
    top: float

    def continues_with(self, left: float, bottom: float, top: float) -> bool:
        """Le caractère suit-il ce bloc : même ligne, juste après lui ?"""
        height = self.top - self.bottom
        same_line = min(top, self.top) - max(bottom, self.bottom) > height / 2
        return same_line and -height < left - self.right < _MAX_WORD_GAP * height


def _text_blocks(textpage: pdfium.PdfTextPage) -> list[_Block]:
    """Caractères regroupés en blocs : coupure aux retours à la ligne et aux grands écarts.

    Pas de `count_rects()` : PDFium y coupe un mot aux paires crénées (« A » |
    « udit » dans un PDF de Chrome), et `get_text_bounded` y reprend les lettres
    voisines du bord.
    """
    blocks: list[_Block] = []
    current: _Block | None = None
    space = False
    for index in range(textpage.count_chars()):
        code = pdfium_c.FPDFText_GetUnicode(textpage.raw, index)
        char = chr(code)
        if char in '\r\n':
            current, space = None, False
            continue
        # Espace, ou moitié de paire UTF-16 (hors plan de base, sans intérêt ici).
        if char.isspace() or 0xD800 <= code <= 0xDFFF:
            space = current is not None
            continue
        # Hauteur « large » (police) pour la ligne, largeur exacte pour les écarts.
        left, _bottom, right, _top = textpage.get_charbox(index)
        _left, bottom, _right, top = textpage.get_charbox(index, loose=True)
        if current is not None and current.continues_with(left, bottom, top):
            current.text += f' {char}' if space else char
            current.right = max(current.right, right)
            current.bottom, current.top = min(current.bottom, bottom), max(current.top, top)
        else:
            current = _Block(char, left, bottom, right, top)
            blocks.append(current)
        space = False
    return blocks


def _text_lines(page: pdfium.PdfPage, scale: float, offset_y: int) -> list[OcrLine] | None:
    """Blocs de texte de la page, ou `None` si elle n'a pas de texte exploitable."""
    textpage = page.get_textpage()
    try:
        content = textpage.get_text_range()
        if sum(1 for char in content if not char.isspace()) < _MIN_TEXT_CHARS:
            return None
        blocks = _text_blocks(textpage)
    finally:
        textpage.close()
    _width, height = page.get_size()
    # Repère PDF : origine en bas à gauche, en points → pixels, origine en haut.
    return [
        OcrLine(
            text=block.text,
            confidence=1.0,
            bbox=[
                round(block.left * scale),
                round((height - block.top) * scale) + offset_y,
                round(block.right * scale),
                round((height - block.bottom) * scale) + offset_y,
            ],
        )
        for block in blocks
    ]


def _ocr_lines(
    page: pdfium.PdfPage,
    scale: float,
    offset_y: int,
    read_image: Callable[[str], OcrExtractionResult],
) -> list[OcrLine]:
    """Rend la page en PNG temporaire et la passe à l'OCR existant."""
    bitmap = page.render(scale=scale, may_draw_forms=False)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
    try:
        try:
            bitmap.to_pil().save(tmp, format='PNG')
        finally:
            bitmap.close()
            tmp.close()
        result = read_image(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except FileNotFoundError:
            pass
    return [_shifted(line, offset_y) for line in result.lines]


def _shifted(line: OcrLine, offset_y: int) -> OcrLine:
    """Décale un bloc OCR sous les pages précédentes (bbox vide : inchangée)."""
    if len(line.bbox) != 4:
        return line
    x_min, y_min, x_max, y_max = line.bbox
    return line.model_copy(update={'bbox': [x_min, y_min + offset_y, x_max, y_max + offset_y]})


def extract_text_from_pdf(
    content: bytes,
    read_image: Callable[[str], OcrExtractionResult],
) -> OcrExtractionResult:
    """Texte d'un PDF, page par page, dans le contrat de l'OCR d'une photo.

    `read_image` : OCR d'une image (chemin d'un PNG), appelé pour chaque page
    sans texte — `extract_text_from_image` en production.

    `FileValidationError` : PDF protégé, illisible ou trop long (400).
    `OcrEngineError` : rendu d'une page impossible, ou échec de l'OCR (500).
    """
    lines: list[OcrLine] = []
    with _pdfium_lock:
        document = _open_document(content)
        try:
            offset_y = 0
            for page_index in range(len(document)):
                page = document[page_index]
                try:
                    width, height = page.get_size()
                    scale = _page_scale(width, height)
                    page_lines = _text_lines(page, scale, offset_y)
                    if page_lines is None:
                        page_lines = _ocr_lines(page, scale, offset_y, read_image)
                    lines.extend(page_lines)
                    offset_y += round(height * scale)
                except pdfium.PdfiumError as exc:
                    logger.warning('PDF page rendering failed: %s', exc)
                    raise OcrEngineError('Échec du rendu du PDF.') from exc
                finally:
                    page.close()
        finally:
            document.close()

    confidence = sum(line.confidence for line in lines) / len(lines) if lines else 0.0
    return OcrExtractionResult(
        raw_text='\n'.join(line.text for line in lines),
        confidence_score=round(confidence, 6),
        lines=lines,
    )
