"""Tests HTTP de `POST /internal/ocr/extract-text` — moteur PaddleOCR mocké.

On ne veut *jamais* charger PaddleOCR pendant la suite unitaire :
- l'init dépasse 10 s (téléchargement puis chargement des modèles) ;
- la CI n'a pas forcément accès aux miroirs Paddle ;
- on veut tester le contrat HTTP, pas le moteur.

On patche donc `app.main.extract_text_from_image` avant chaque appel.
Un test dédié couvre la vraie transformation (`test_ocr_transform.py`) sans
Paddle non plus, en simulant la structure de retour native.
"""
from __future__ import annotations

import io
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.file_validation import MAX_FILE_SIZE_BYTES
from app.main import app
from app.schemas import OcrExtractionResult, OcrLine
from app.security import INTERNAL_API_KEY_HEADER

client = TestClient(app)

_TEST_API_KEY = 'test-internal-key-do-not-use-in-prod'


# ─── Petits helpers : bytes réellement conformes aux signatures ────────────


def _image_bytes(image_format: str, size: tuple[int, int] = (8, 8)) -> bytes:
    """Vraie image minuscule : passe la signature et le contrôle des dimensions
    (`check_image`) ; ses pixels ne sont jamais lus (OCR mocké)."""
    buffer = io.BytesIO()
    Image.new('RGB', size, 'white').save(buffer, image_format)
    return buffer.getvalue()


def _make_png_bytes() -> bytes:
    return _image_bytes('PNG')


def _make_jpeg_bytes() -> bytes:
    return _image_bytes('JPEG')


def _make_webp_bytes() -> bytes:
    return _image_bytes('WEBP')


def _mock_extract(*_args, **_kwargs) -> OcrExtractionResult:
    return OcrExtractionResult(
        raw_text='ligne 1\nligne 2',
        confidence_score=0.935,
        lines=[
            OcrLine(text='ligne 1', confidence=0.98, bbox=[10, 20, 100, 40]),
            OcrLine(text='ligne 2', confidence=0.89, bbox=[10, 50, 120, 70]),
        ],
    )


# ─── Auth ──────────────────────────────────────────────────────────────────


def test_extract_text_without_key_returns_401() -> None:
    with patch('app.config.API_KEY', _TEST_API_KEY):
        response = client.post(
            '/internal/ocr/extract-text',
            files={'document': ('a.png', _make_png_bytes(), 'image/png')},
        )
    assert response.status_code == 401
    assert _TEST_API_KEY not in response.text


def test_extract_text_with_wrong_key_returns_401() -> None:
    with patch('app.config.API_KEY', _TEST_API_KEY):
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: 'wrong-key'},
            files={'document': ('a.png', _make_png_bytes(), 'image/png')},
        )
    assert response.status_code == 401
    assert _TEST_API_KEY not in response.text


# ─── Formats acceptés ──────────────────────────────────────────────────────


def _post_with_valid_key(files: dict) -> object:
    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.main.extract_text_from_image', side_effect=_mock_extract):
        return client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files=files,
        )


def test_extract_text_accepts_jpeg() -> None:
    response = _post_with_valid_key(
        {'document': ('a.jpg', _make_jpeg_bytes(), 'image/jpeg')},
    )
    assert response.status_code == 200


def test_extract_text_accepts_png_and_returns_contract() -> None:
    response = _post_with_valid_key(
        {'document': ('a.png', _make_png_bytes(), 'image/png')},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {'raw_text', 'confidence_score', 'lines'}
    assert body['raw_text'] == 'ligne 1\nligne 2'
    assert body['confidence_score'] == 0.935
    assert body['lines'] == [
        {'text': 'ligne 1', 'confidence': 0.98, 'bbox': [10, 20, 100, 40]},
        {'text': 'ligne 2', 'confidence': 0.89, 'bbox': [10, 50, 120, 70]},
    ]


def test_extract_text_accepts_webp() -> None:
    response = _post_with_valid_key(
        {'document': ('a.webp', _make_webp_bytes(), 'image/webp')},
    )
    assert response.status_code == 200


# ─── Validation ────────────────────────────────────────────────────────────


def test_extract_text_rejects_forbidden_mime() -> None:
    response = _post_with_valid_key(
        {'document': ('a.txt', b'facture', 'text/plain')},
    )
    assert response.status_code == 400
    assert response.json()['detail'] == 'Type de fichier non autorisé.'


def test_extract_text_rejects_signature_mismatch() -> None:
    """PNG déclaré, contenu JPEG — l'attaquant ne bat pas la signature."""
    response = _post_with_valid_key(
        {'document': ('fake.png', _make_jpeg_bytes(), 'image/png')},
    )
    assert response.status_code == 400
    assert 'Signature' in response.json()['detail']


def test_extract_text_rejects_empty_file() -> None:
    response = _post_with_valid_key(
        {'document': ('empty.png', b'', 'image/png')},
    )
    assert response.status_code == 400
    assert response.json()['detail'] == 'Fichier vide.'


def test_extract_text_rejects_oversize_file() -> None:
    # `MAX_FILE_SIZE_BYTES + 1` : on prouve juste que la borne est stricte.
    # Contenu = bytes JPEG valides + padding pour dépasser la borne.
    payload = _make_jpeg_bytes() + b'\x00' * (MAX_FILE_SIZE_BYTES + 1 - len(_make_jpeg_bytes()))
    response = _post_with_valid_key(
        {'document': ('big.jpg', payload, 'image/jpeg')},
    )
    assert response.status_code == 400
    assert 'trop volumineux' in response.json()['detail']


# ─── Erreurs moteur / cleanup ──────────────────────────────────────────────


def test_extract_text_returns_500_on_engine_failure() -> None:
    from app.ocr import OcrEngineError

    def _boom(*_a, **_k):
        raise OcrEngineError('boom')

    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.main.extract_text_from_image', side_effect=_boom):
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files={'document': ('a.png', _make_png_bytes(), 'image/png')},
        )
    assert response.status_code == 500
    # Message générique : aucun détail interne / stack / chemin.
    assert response.json()['detail'] == 'Erreur interne du moteur OCR.'
    assert 'boom' not in response.text


def test_extract_text_cleans_tempfile_on_success(tmp_path, monkeypatch) -> None:
    """Vérifie que le tempfile est supprimé après une inférence réussie."""
    # On force `tempfile.gettempdir` vers un répertoire dédié pour lister
    # facilement ce qui reste après l'appel.
    monkeypatch.setenv('TMPDIR', str(tmp_path))

    response = _post_with_valid_key(
        {'document': ('a.png', _make_png_bytes(), 'image/png')},
    )
    assert response.status_code == 200
    remaining = [f for f in os.listdir(tmp_path) if f.endswith(('.png', '.jpg', '.webp'))]
    assert remaining == [], f'tempfiles non nettoyés : {remaining}'


def test_extract_text_returns_500_when_engine_init_fails() -> None:
    """Si le chargement du pipeline PaddleOCR échoue (téléchargement modèle
    KO, OSError…), l'exception native ne doit pas remonter au client :
    on doit voir le même 500 générique que sur un échec d'inférence.
    """
    def _init_boom(*_a, **_k):
        raise RuntimeError('paddle native load boom')

    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.ocr._get_engine', side_effect=_init_boom):
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files={'document': ('a.png', _make_png_bytes(), 'image/png')},
        )
    assert response.status_code == 500
    assert response.json()['detail'] == 'Erreur interne du moteur OCR.'
    # Aucun détail de l'exception native ne doit fuiter.
    assert 'paddle' not in response.text.lower()
    assert 'boom' not in response.text


def test_extract_text_cleans_tempfile_on_engine_error(tmp_path, monkeypatch) -> None:
    from app.ocr import OcrEngineError

    monkeypatch.setenv('TMPDIR', str(tmp_path))

    def _boom(*_a, **_k):
        raise OcrEngineError('boom')

    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.main.extract_text_from_image', side_effect=_boom):
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files={'document': ('a.png', _make_png_bytes(), 'image/png')},
        )
    assert response.status_code == 500
    remaining = [f for f in os.listdir(tmp_path) if f.endswith(('.png', '.jpg', '.webp'))]
    assert remaining == [], f'tempfiles non nettoyés : {remaining}'


# ─── Bombes de décompression, fichiers tronqués (fabriqués ici) ────────────


def _bomb(image_format: str = 'PNG', side: int = 12_000) -> bytes:
    """Image unie très grande mais très compressible : 140 Ko en PNG pour
    12 000 × 12 000 px, 144 millions de pixels une fois décodée."""
    buffer = io.BytesIO()
    Image.new('L', (side, side), 0).save(buffer, image_format)
    return buffer.getvalue()


def _post_without_ocr(files: dict) -> object:
    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.main.extract_text_from_image') as ocr:
        response = client.post(
            '/internal/ocr/extract-text',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
            files=files,
        )
    ocr.assert_not_called()
    return response


@pytest.mark.parametrize(('image_format', 'side', 'mime'), [
    ('PNG', 8_000, 'image/png'),  # 64 Mpx : avertissement de Pillow
    ('PNG', 12_000, 'image/png'),  # 144 Mpx : erreur de Pillow
    ('WEBP', 8_000, 'image/webp'),
])
def test_extract_text_refuses_a_decompression_bomb_before_ocr(
    image_format: str, side: int, mime: str,
) -> None:
    content = _bomb(image_format, side)
    assert len(content) < 200_000
    response = _post_without_ocr({'document': ('bomb', content, mime)})
    assert response.status_code == 400
    assert response.json() == {'detail': 'Image trop grande (50 millions de pixels au maximum).'}


@pytest.mark.parametrize(('image_format', 'mime'), [('PNG', 'image/png'), ('WEBP', 'image/webp')])
def test_extract_text_refuses_a_truncated_image(image_format: str, mime: str) -> None:
    content = _image_bytes(image_format, (640, 480))
    response = _post_without_ocr({'document': ('cut', content[: len(content) // 2], mime)})
    assert response.status_code == 400
    assert response.json() == {'detail': 'Image illisible.'}


def test_extract_text_judges_the_content_not_the_extension() -> None:
    """Nom en .png, contenu et type JPEG : seul le contenu compte, accepté."""
    response = _post_with_valid_key({'document': ('photo.png', _make_jpeg_bytes(), 'image/jpeg')})
    assert response.status_code == 200
    # Type annoncé PNG, contenu JPEG : refusé par la signature, sans OCR.
    response = _post_without_ocr({'document': ('photo.png', _make_jpeg_bytes(), 'image/png')})
    assert response.status_code == 400


def test_pillow_refuses_a_bomb_anywhere_in_the_service() -> None:
    """Plafond de Pillow posé pour tout le processus à l'import de `image_prep`."""
    from app.image_prep import MAX_PIXELS, ImageDecodeError, open_image

    assert Image.MAX_IMAGE_PIXELS == MAX_PIXELS == 50_000_000
    with pytest.raises(ImageDecodeError, match='trop grande'):
        open_image(_bomb('PNG', 8_000))
