"""Factures PDF sur `POST /internal/ocr/extract-text` — PaddleOCR mocké.

Fichiers de `tests/fixtures/` (quelques Ko, générés avec reportlab) :
- `invoice_text.pdf`      : facture avec texte (tableau de 2 lignes) ;
- `invoice_chromium.pdf`  : facture imprimée en PDF par Chromium (mots coupés
                            en plusieurs objets texte aux paires crénées) ;
- `invoice_scanned.pdf`   : la même facture en image, sans texte ;
- `invoice_protected.pdf` : protégé par mot de passe ;
- `invoice_six_pages.pdf` : 6 pages ;
- `not_a_pdf.pdf`         : extension .pdf, contenu texte.

Les PDF de pages blanches (nombre et taille de pages) sont fabriqués dans les
tests avec pypdfium2 (`_blank_pdf`).
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from unittest.mock import patch

import pypdfium2 as pdfium
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.schemas import OcrExtractionResult, OcrLine
from app.security import INTERNAL_API_KEY_HEADER
from app.visual_rows import build_visual_rows

client = TestClient(app)

_TEST_API_KEY = 'test-internal-key-do-not-use-in-prod'
_FIXTURES = Path(__file__).parent / 'fixtures'


def _post_pdf(name: str, read_image=None) -> tuple[object, int]:  # noqa: ANN001
    """Envoie une fixture ; renvoie la réponse et le nombre d'appels à l'OCR d'image."""
    side_effect = read_image or _unexpected_ocr
    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.main.extract_text_from_image', side_effect=side_effect) as ocr:
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files={'document': (name, (_FIXTURES / name).read_bytes(), 'application/pdf')},
        )
    return response, ocr.call_count


def _blank_pdf(sizes: list[tuple[float, float]]) -> bytes:
    """PDF de pages blanches, aux tailles données en points."""
    document = pdfium.PdfDocument.new()
    for width, height in sizes:
        document.new_page(width, height)
    buffer = io.BytesIO()
    document.save(buffer)
    document.close()
    return buffer.getvalue()


def _post_built_pdf(content: bytes, read_image=None) -> tuple[object, int]:  # noqa: ANN001
    side_effect = read_image or _unexpected_ocr
    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.main.extract_text_from_image', side_effect=side_effect) as ocr:
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files={'document': ('built.pdf', content, 'application/pdf')},
        )
    return response, ocr.call_count


def _unexpected_ocr(*_args, **_kwargs) -> OcrExtractionResult:
    raise AssertionError('OCR appelé sur un PDF qui contient du texte')


def test_text_pdf_is_read_without_ocr() -> None:
    response, ocr_calls = _post_pdf('invoice_text.pdf')
    assert response.status_code == 200
    assert ocr_calls == 0
    body = response.json()
    texts = [line['text'] for line in body['lines']]
    assert 'Savon olive 100 g' in texts
    assert 'Frais de port' in texts
    assert body['confidence_score'] == 1.0
    assert all(line['confidence'] == 1.0 for line in body['lines'])


def test_text_pdf_blocks_form_the_same_visual_rows_as_a_photo() -> None:
    """Repère pixel, origine en haut : les cellules d'une ligne du tableau se regroupent."""
    body = _post_pdf('invoice_text.pdf')[0].json()
    lines = [OcrLine(**line) for line in body['lines']]
    rows = [[lines[i].text for i in row] for row in build_visual_rows(lines)]
    assert ['Savon olive 100 g', '4', '2.50', '10.00'] in rows
    assert ['Frais de port', '1', '6.90', '6.90'] in rows
    # Haut → bas : le fournisseur avant les lignes du tableau.
    assert rows.index(['Fournisseur PDF Test']) < rows.index(['Frais de port', '1', '6.90', '6.90'])


def test_chromium_pdf_words_split_by_kerning_are_read_whole() -> None:
    """« Fournisseur A » + « udit » (crénage) : un seul bloc, sans lettre reprise du voisin."""
    body = _post_pdf('invoice_chromium.pdf')[0].json()
    lines = [OcrLine(**line) for line in body['lines']]
    rows = [[lines[i].text for i in row] for row in build_visual_rows(lines)]
    assert ['Fournisseur Audit 123456'] in rows
    assert ['FACTURE N° FA-123456-1'] in rows
    assert ['CARTON AUDIT 123456', '6', '1.20', '7.20'] in rows
    assert ['Frais de port', '1', '6.90', '6.90'] in rows
    assert ['Désignation', 'Qté', 'Prix unitaire HT', 'Total HT'] in rows


def test_scanned_pdf_pages_are_rendered_then_passed_to_ocr(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv('TMPDIR', str(tmp_path))
    rendered: list[tuple[int, int]] = []

    def read_image(path: str) -> OcrExtractionResult:
        with Image.open(path) as image:
            rendered.append(image.size)
        return OcrExtractionResult(
            raw_text='Savon olive 100 g',
            confidence_score=0.9,
            lines=[OcrLine(text='Savon olive 100 g', confidence=0.9, bbox=[10, 20, 200, 40])],
        )

    response, ocr_calls = _post_pdf('invoice_scanned.pdf', read_image)
    assert response.status_code == 200
    assert ocr_calls == 1
    # A4 rendu à 200 dpi.
    assert rendered == [(1654, 2339)]
    assert response.json()['lines'] == [{'text': 'Savon olive 100 g', 'confidence': 0.9, 'bbox': [10, 20, 200, 40]}]
    # Image temporaire supprimée.
    assert [f for f in os.listdir(tmp_path) if f.endswith('.png')] == []


def test_protected_pdf_is_refused() -> None:
    response, _ = _post_pdf('invoice_protected.pdf')
    assert response.status_code == 400
    assert response.json()['detail'] == 'PDF protégé par mot de passe.'


def test_pdf_with_too_many_pages_is_refused() -> None:
    response, _ = _post_pdf('invoice_six_pages.pdf')
    assert response.status_code == 400
    assert response.json()['detail'] == 'PDF trop long (5 pages au maximum).'


def test_fake_pdf_is_refused_by_its_signature() -> None:
    response, _ = _post_pdf('not_a_pdf.pdf')
    assert response.status_code == 400
    assert 'Signature' in response.json()['detail']


def test_truncated_pdf_is_refused() -> None:
    content = (_FIXTURES / 'invoice_text.pdf').read_bytes()[:200]
    with patch('app.config.API_KEY', _TEST_API_KEY):
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files={'document': ('cut.pdf', content, 'application/pdf')},
        )
    assert response.status_code == 400
    assert response.json()['detail'] == 'PDF illisible.'


_A4 = (595, 842)


def test_built_pdf_with_many_pages_is_refused() -> None:
    response, _ = _post_built_pdf(_blank_pdf([_A4] * 50))
    assert response.status_code == 400
    assert response.json()['detail'] == 'PDF trop long (5 pages au maximum).'


def test_pdf_with_a_poster_page_is_refused_before_rendering() -> None:
    """Page A0 après une page A4 : refusée sans rendre aucune page."""
    with patch('pypdfium2.PdfPage.render') as render:
        response, ocr_calls = _post_built_pdf(_blank_pdf([_A4, (2384, 3370)]))
    assert response.status_code == 400
    assert response.json()['detail'] == 'PDF : page trop grande (format A2 au maximum).'
    render.assert_not_called()
    assert ocr_calls == 0


def test_pdf_with_a_very_long_page_is_refused() -> None:
    response, _ = _post_built_pdf(_blank_pdf([(227, 6000)]))  # 2,10 m de long
    assert response.status_code == 400


def test_long_receipt_pdf_is_accepted() -> None:
    """Ticket de caisse de 8 cm sur 1,40 m : rendu (côté long ≤ 4000 px) puis lu."""
    empty = OcrExtractionResult(raw_text='', confidence_score=0.0, lines=[])
    response, ocr_calls = _post_built_pdf(_blank_pdf([(227, 4000)]), read_image=lambda _path: empty)
    assert response.status_code == 200
    assert ocr_calls == 1


def test_built_truncated_pdf_is_refused() -> None:
    content = _blank_pdf([_A4] * 3)
    response, _ = _post_built_pdf(content[: len(content) // 2])
    assert response.status_code == 400
    assert response.json()['detail'] == 'PDF illisible.'


def test_ocr_blocks_of_later_pages_are_shifted_below_earlier_ones() -> None:
    """Deux pages scannées : la seconde est décalée de la hauteur de la première."""
    from app.pdf import _shifted

    line = OcrLine(text='x', confidence=0.5, bbox=[1, 2, 3, 4])
    assert _shifted(line, 2339).bbox == [1, 2341, 3, 2343]
    assert _shifted(OcrLine(text='y', confidence=0.5), 2339).bbox == []
