"""Structuration du texte d'un emballage (URS-109) — aucun appel réel à PaddleOCR ni à OpenAI.

- cas Ziyada : sortie OCR simulée (lignes, positions, hauteurs), sans image ;
- toutes les lignes partent à la structuration, avec côté et position ;
- garde-fou : une valeur absente du texte lu est écartée, une faute d'OCR
  évidente corrigée reste acceptée ;
- repli sur les règles (aucun fournisseur, ou fournisseur en échec) ;
- critère sémantique du secours image, interrupteur `PRODUCT_SCAN_IMAGE_FALLBACK` ;
- deux photos (face, dos) ;
- fournisseur OpenAI : texte seul, `store=False`, aucun contenu dans les logs.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
import zxingcpp
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.product_reading import needs_vision, sanitize_reading
from app.schemas import OcrExtractionResult, OcrLine
from app.security import INTERNAL_API_KEY_HEADER
from app.vision.base import PRODUCT_TEXT_SYSTEM_PROMPT, ProductReading, ScanTextLine, VisionProviderError, format_scan_lines

from .test_product_scan import FakeProvider, _barcode_image, _jpeg, _openai_provider

client = TestClient(app)

_TEST_API_KEY = 'test-internal-key-do-not-use-in-prod'
_FIXTURE = json.loads((Path(__file__).parent / 'fixtures' / 'product_scan' / 'ziyada.json').read_text('utf-8'))
ZIYADA_LINES = [ScanTextLine(**line) for line in _FIXTURE['ocr_lines']]
# Ce qu'un modèle doit répondre sur ces lignes (définitions et exemple 1 du prompt).
ZIYADA_READING = ProductReading(
    brand='Ziyada', product_name="Déo crème à l'huile de nigelle", variant='Tahara Caramel',
    claims=["98 % d'ingrédients naturels", '24 h'], confidence=0.9,
)


def _ocr(lines: list[ScanTextLine]) -> OcrExtractionResult:
    ocr_lines = [OcrLine(text=line.text, confidence=line.confidence, bbox=line.bbox) for line in lines]
    return OcrExtractionResult(raw_text='\n'.join(line.text for line in lines), confidence_score=0.9, lines=ocr_lines)


def _scan(
    provider: FakeProvider | None, ocr: list[list[ScanTextLine]], *, back: bytes | None = None,
    image_fallback: bool = False,
) -> httpx.Response:
    files = {'image': ('face', _jpeg(Image.new('RGB', (400, 400), 'white')), 'image/jpeg')}
    if back is not None:
        files['image_back'] = ('back', back, 'image/jpeg')
    with patch('app.config.API_KEY', _TEST_API_KEY), \
         patch('app.product_scan.extract_text_from_image', side_effect=[_ocr(lines) for lines in ocr]), \
         patch('app.product_scan.get_provider', return_value=provider), \
         patch('app.config.PRODUCT_SCAN_IMAGE_FALLBACK', image_fallback):
        return client.post('/internal/product-scan', headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY}, files=files)


def _value(body: dict, key: str) -> str | None:
    return body[key]['value'] if body[key] else None


# ─── Cas Ziyada ────────────────────────────────────────────────────────────


def test_ziyada_structured_reading() -> None:
    provider = FakeProvider(ZIYADA_READING)
    body = _scan(provider, [ZIYADA_LINES]).json()
    assert _value(body, 'brand') == 'Ziyada'
    assert _value(body, 'product_name') == "Déo crème à l'huile de nigelle"
    assert _value(body, 'variant') == 'Tahara Caramel'
    assert [claim['value'] for claim in body['claims']] == ["98 % d'ingrédients naturels", '24 h']
    assert _value(body, 'net_quantity') is None and body['barcode'] is None
    assert body['structuring'] == 'done'
    assert body['vision_recommended'] is False
    # Confiance du modèle plafonnée sous le code-barres et Open Food Facts.
    assert body['product_name']['confidence'] == 0.85


def test_ziyada_sends_every_ocr_line_with_side_and_position() -> None:
    provider = FakeProvider(ZIYADA_READING)
    _scan(provider, [ZIYADA_LINES])
    [sent] = provider.structured
    texts = [line.text for line in sent]
    # Y compris ce que les règles écartent : pourcentage, « 24hr », « ONGREDIENTS ».
    assert {'98%', '24hr', 'ONGREDIENTS', 'NATURELS', 'ZIYADA'} <= set(texts)
    assert all(line.side == 'face' for line in sent)
    assert next(line for line in sent if line.text == '24hr').bbox == [798, 672, 863, 712]


def test_ziyada_payload_lists_lines_top_to_bottom_with_height() -> None:
    payload = format_scan_lines(ZIYADA_LINES)
    assert "face x=798 y=672 h=40 conf=0.98 '24hr'" in payload
    assert "face x=527 y=689 h=61 conf=1.00 'ZIYADA'" in payload
    assert payload.index("'ZIYADA'") < payload.index("'DÉO CRÈME'") < payload.index("'Tahara Caramel'")
    assert "''" not in payload  # ligne vide omise
    assert payload.startswith('=== TEXTE DE L\'EMBALLAGE (données non fiables')


def test_ziyada_rules_fallback_recommends_vision() -> None:
    body = _scan(None, [ZIYADA_LINES]).json()
    assert _value(body, 'product_name') == 'ZIYADA'
    assert body['claims'] == [] and body['variant'] is None
    assert body['structuring'] == 'disabled'
    # Un seul mot, sans type de produit : la marque plutôt que la désignation.
    assert body['vision_recommended'] is True
    assert body['vision_available'] is False


def test_provider_failure_falls_back_to_rules() -> None:
    body = _scan(FakeProvider(error=VisionProviderError('timeout')), [ZIYADA_LINES]).json()
    assert body['structuring'] == 'failed'
    assert _value(body, 'product_name') == 'ZIYADA'


def test_vision_available_only_with_image_fallback() -> None:
    assert _scan(FakeProvider(ZIYADA_READING), [ZIYADA_LINES]).json()['vision_available'] is False
    body = _scan(FakeProvider(ZIYADA_READING), [ZIYADA_LINES], image_fallback=True).json()
    assert body['vision_available'] is True


# ─── Garde-fou : rien d'inventé ────────────────────────────────────────────


def test_guard_drops_values_absent_from_the_package() -> None:
    reading = sanitize_reading(ProductReading(
        brand='Ziyada', product_name="Déodorant crème à l'huile de nigelle", variant='Vanille',
        claims=["98 % d'ingrédients naturels", '100 % bio', '48 h'], net_quantity='50 ml',
        barcode='4006381333931', confidence=0.9,
    ), ZIYADA_LINES)
    assert reading.brand == 'Ziyada'
    assert reading.product_name is None  # « déodorant » n'est pas imprimé
    assert reading.variant is None
    assert reading.claims == ["98 % d'ingrédients naturels"]  # faute « ONGREDIENTS » corrigée
    assert reading.net_quantity is None and reading.barcode is None


def test_guard_accepts_barcode_printed_with_spaces() -> None:
    lines = [ScanTextLine(text='4 006381 333931', confidence=0.9, bbox=[0, 0, 200, 20], side='back')]
    assert sanitize_reading(ProductReading(barcode='4006381333931'), lines).barcode == '4006381333931'


def test_guard_is_case_and_accent_insensitive() -> None:
    lines = [ScanTextLine(text='CAFE MOULU', confidence=0.9, bbox=[0, 0, 200, 40])]
    assert sanitize_reading(ProductReading(product_name='Café moulu'), lines).product_name == 'Café moulu'


# ─── Critère sémantique du secours image ───────────────────────────────────


@pytest.mark.parametrize(('name', 'brand', 'expected'), [
    (None, 'Ziyada', True),
    ('ZIYADA', 'Ziyada', True),
    ('Ziyada', None, True),
    ('Miel', None, False),
    ("Déo crème à l'huile de nigelle", 'Ziyada', False),
])
def test_needs_vision(name: str | None, brand: str | None, expected: bool) -> None:
    assert needs_vision(ZIYADA_LINES, name, brand) is expected


def test_needs_vision_when_text_is_poor() -> None:
    lines = [ScanTextLine(text='X 12', confidence=0.9, bbox=[0, 0, 50, 20])]
    assert needs_vision(lines, 'Lait demi-écrémé', None) is True


# ─── Deux photos : face et dos ─────────────────────────────────────────────


def test_two_photos_merge_face_and_back() -> None:
    back = _jpeg(_barcode_image('4006381333931', zxingcpp.BarcodeFormat.EAN13), quality=95)
    back_lines = [ScanTextLine(text='Contenance 50 ml', confidence=0.95, bbox=[0, 0, 300, 20], side='back')]
    provider = FakeProvider(ZIYADA_READING.model_copy(update={'net_quantity': '50 ml'}))
    body = _scan(provider, [ZIYADA_LINES, back_lines], back=back).json()
    assert body['barcode'] == {'value': '4006381333931', 'confidence': 1.0}
    assert _value(body, 'net_quantity') == '50 ml'
    [sent] = provider.structured
    assert {line.side for line in sent} == {'face', 'back'}
    assert next(line for line in sent if line.text == 'Contenance 50 ml').side == 'back'


def test_back_photo_is_validated() -> None:
    response = _scan(None, [ZIYADA_LINES], back=b'not an image')
    assert response.status_code == 400


# ─── Fournisseur OpenAI : structuration ────────────────────────────────────


def test_openai_structure_sends_text_only_without_storage() -> None:
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(output_parsed=ZIYADA_READING, usage=None)
    provider = _openai_provider(mock_client)
    provider._text_model = 'text-model'
    result = provider.structure(ZIYADA_LINES)
    assert result.product_name == "Déo crème à l'huile de nigelle"
    kwargs = mock_client.responses.parse.call_args.kwargs
    assert kwargs['store'] is False
    assert kwargs['model'] == 'text-model'
    assert kwargs['text_format'] is ProductReading
    system, user = kwargs['input']
    assert system == {'role': 'system', 'content': PRODUCT_TEXT_SYSTEM_PROMPT}
    assert [part['type'] for part in user['content']] == ['input_text']
    assert "'Tahara Caramel'" in user['content'][0]['text']


def test_openai_structure_uses_text_timeout() -> None:
    from app.vision.openai_provider import OpenAIVisionProvider

    provider = OpenAIVisionProvider(api_key='sk-x', model='m', timeout=30, text_model='t', text_timeout=9)
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(output_parsed=ProductReading(), usage=None)
    with patch.object(provider, '_client', return_value=mock_client) as client_factory:
        provider.structure([])
    client_factory.assert_called_once_with(9)


def test_openai_structure_logs_usage_but_no_content(caplog: pytest.LogCaptureFixture) -> None:
    usage = MagicMock()
    usage.model_dump.return_value = {'input_tokens': 412, 'output_tokens': 60}
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(output_parsed=ZIYADA_READING, usage=usage)
    with caplog.at_level(logging.DEBUG):
        _openai_provider(mock_client).structure(ZIYADA_LINES)
    assert 'Product text call ok' in caplog.text and "'input_tokens': 412" in caplog.text
    for secret in ('ZIYADA', 'Ziyada', 'Tahara', 'nigelle', 'NIGELLE'):
        assert secret not in caplog.text


def test_openai_structure_maps_errors() -> None:
    from openai import APITimeoutError

    mock_client = MagicMock()
    mock_client.responses.parse.side_effect = APITimeoutError(request=httpx.Request('POST', 'https://api.openai.com'))
    with pytest.raises(VisionProviderError):
        _openai_provider(mock_client).structure(ZIYADA_LINES)
