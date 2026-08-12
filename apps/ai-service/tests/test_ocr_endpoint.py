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

import os
import struct
import zlib
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.file_validation import MAX_FILE_SIZE_BYTES
from app.main import app
from app.schemas import OcrExtractionResult, OcrLine
from app.security import INTERNAL_API_KEY_HEADER

client = TestClient(app)

_TEST_API_KEY = 'test-internal-key-do-not-use-in-prod'


# ─── Petits helpers : bytes réellement conformes aux signatures ────────────


def _make_png_bytes() -> bytes:
    """PNG 1×1 blanc — génère un vrai fichier PNG valide.

    Suffisant pour passer notre validation de signature ; le contenu
    n'est jamais réellement décodé (OCR mocké).
    """
    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    ihdr = b'IHDR' + ihdr_data
    ihdr_chunk = struct.pack('>I', len(ihdr_data)) + ihdr + struct.pack('>I', zlib.crc32(ihdr))
    idat_data = zlib.compress(b'\x00\xff\xff\xff')
    idat = b'IDAT' + idat_data
    idat_chunk = struct.pack('>I', len(idat_data)) + idat + struct.pack('>I', zlib.crc32(idat))
    iend_chunk = b'\x00\x00\x00\x00IEND\xaeB`\x82'
    return signature + ihdr_chunk + idat_chunk + iend_chunk


def _make_jpeg_bytes() -> bytes:
    """JPEG minimal — les 3 octets FF D8 FF suffisent pour la signature."""
    return b'\xff\xd8\xff\xe0\x00\x10JFIF' + b'\x00' * 128 + b'\xff\xd9'


def _make_webp_bytes() -> bytes:
    """WebP minimal — magic RIFF + WEBP au bon offset."""
    size = struct.pack('<I', 20)
    return b'RIFF' + size + b'WEBP' + b'VP8L' + b'\x00' * 16


def _mock_extract(*_args, **_kwargs) -> OcrExtractionResult:
    return OcrExtractionResult(
        raw_text='ligne 1\nligne 2',
        confidence_score=0.935,
        lines=[
            OcrLine(text='ligne 1', confidence=0.98),
            OcrLine(text='ligne 2', confidence=0.89),
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
        {'text': 'ligne 1', 'confidence': 0.98},
        {'text': 'ligne 2', 'confidence': 0.89},
    ]


def test_extract_text_accepts_webp() -> None:
    response = _post_with_valid_key(
        {'document': ('a.webp', _make_webp_bytes(), 'image/webp')},
    )
    assert response.status_code == 200


# ─── Validation ────────────────────────────────────────────────────────────


def test_extract_text_rejects_forbidden_mime() -> None:
    response = _post_with_valid_key(
        {'document': ('a.pdf', b'%PDF-1.4\n%any', 'application/pdf')},
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
