"""Tests du scan d'emballage (URS-109) — aucun appel réel à PaddleOCR ni à OpenAI.

- lecture locale : contenance (regex fr/en), code-barres sur images générées,
  heuristiques OCR, endpoint `/internal/product-scan` (OCR mocké) ;
- préparation de l'image : réduction, ré-encodage, EXIF retiré ;
- secours image : registre (openai / none / inconnu / sans clé), faux
  fournisseur conforme au `Protocol`, interrupteur `PRODUCT_SCAN_IMAGE_FALLBACK`,
  indisponibilité, absence de contenu dans les logs.
La structuration du texte (cas Ziyada, garde-fou) est dans `test_product_reading.py`.
"""
from __future__ import annotations

import io
import logging
import os
from unittest.mock import MagicMock, patch

import httpx
import pytest
import zxingcpp
from fastapi.testclient import TestClient
from PIL import Image

from app.barcode import decode_barcode, is_valid_gtin
from app.image_prep import PROVIDER_MAX_SIDE_PX, open_image, prepare_for_provider
from app.main import app
from app.product_text import parse_net_quantity, propose_from_ocr
from app.schemas import OcrExtractionResult, OcrLine
from app.security import INTERNAL_API_KEY_HEADER
from app.vision.base import (
    PRODUCT_VISION_SYSTEM_PROMPT,
    ProductReading,
    ProductVisionProvider,
    ScanTextLine,
    VisionProviderError,
)
from app.vision.openai_provider import OpenAIVisionProvider
from app.vision.registry import get_provider

client = TestClient(app)

_TEST_API_KEY = 'test-internal-key-do-not-use-in-prod'
_TEST_OPENAI_KEY = 'sk-fake-openai-key-do-not-use'
_SECRET_TEXT = 'TEXTE_EMBALLAGE_SECRET_123'


# ─── Helpers ───────────────────────────────────────────────────────────────


def _jpeg(image: Image.Image, **save_options: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', **save_options)
    return buffer.getvalue()


def _barcode_image(value: str, fmt: zxingcpp.BarcodeFormat) -> Image.Image:
    """Code-barres réel, posé sur un fond blanc comme sur un emballage."""
    symbol = Image.fromarray(zxingcpp.create_barcode(value, fmt).to_image(scale=4, add_quiet_zones=True))
    canvas = Image.new('RGB', (symbol.width + 400, symbol.height + 300), 'white')
    canvas.paste(symbol.convert('RGB'), (200, 150))
    return canvas


def _ocr_result(*lines: OcrLine) -> OcrExtractionResult:
    return OcrExtractionResult(raw_text='\n'.join(line.text for line in lines), confidence_score=0.9, lines=list(lines))


def _post(url: str, content: bytes, mime: str = 'image/jpeg') -> httpx.Response:
    with patch('app.config.API_KEY', _TEST_API_KEY):
        return client.post(
            url, headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY}, files={'image': ('photo', content, mime)},
        )


class FakeProvider:
    """Faux fournisseur conforme au `Protocol` : enregistre ce qu'il reçoit."""

    def __init__(self, result: ProductReading | None = None, error: Exception | None = None) -> None:
        self.result = result or ProductReading(product_name='Lait demi-écrémé', brand='Lactel', confidence=0.9)
        self.error = error
        self.calls: list[tuple[bytes, str]] = []
        self.structured: list[list[ScanTextLine]] = []

    def structure(self, lines: list[ScanTextLine]) -> ProductReading:
        self.structured.append(lines)
        if self.error:
            raise self.error
        return self.result

    def extract(self, image: bytes, mime_type: str) -> ProductReading:
        self.calls.append((image, mime_type))
        if self.error:
            raise self.error
        return self.result


def _lines(*lines: OcrLine) -> list[ScanTextLine]:
    return [ScanTextLine(**line.model_dump()) for line in lines]


# ─── Contenance nette ──────────────────────────────────────────────────────


@pytest.mark.parametrize(('text', 'expected'), [
    ('Poids net : 500 g', '500 g'),
    ('250 ml', '250 ml'),
    ('1 kg', '1 kg'),
    ('6 x 33 cl', '6 x 33 cl'),
    ('6x33cl', '6 x 33 cl'),
    ('Pack 4×125 g', '4 x 125 g'),
    ('1,5 L', '1,5 L'),
    ('1.5L', '1.5 L'),
    ('Lait 1 litre', '1 L'),
    ('500 grammes', '500 g'),
    ('Net wt 16 oz (454 g)', '16 oz'),
    ('12 fl oz', '12 fl oz'),
    ('33 CL', '33 cl'),
])
def test_parse_net_quantity(text: str, expected: str) -> None:
    assert parse_net_quantity(text) == expected


@pytest.mark.parametrize('text', ['Valeurs nutritionnelles pour 100 g', 'per 100 ml', '2 laits', 'Lot 4521', 'Glace'])
def test_parse_net_quantity_ignores_non_quantities(text: str) -> None:
    assert parse_net_quantity(text) is None


# ─── Code-barres ───────────────────────────────────────────────────────────


@pytest.mark.parametrize('value', ['4006381333931', '96385074', '036000291452', '15400141288763'])
def test_is_valid_gtin_accepts_valid_check_digit(value: str) -> None:
    assert is_valid_gtin(value)


@pytest.mark.parametrize('value', ['4006381333932', '123', '40063813339a1', '', '٤٠٠٦٣٨١٣٣٣٩٣١'])
def test_is_valid_gtin_rejects_invalid(value: str) -> None:
    assert not is_valid_gtin(value)


@pytest.mark.parametrize(('value', 'fmt', 'expected'), [
    ('4006381333931', zxingcpp.BarcodeFormat.EAN13, '4006381333931'),
    ('96385074', zxingcpp.BarcodeFormat.EAN8, '96385074'),
    # zxing rend un UPC-A sous sa forme EAN-13 (zéro de tête) : même GTIN.
    ('036000291452', zxingcpp.BarcodeFormat.UPCA, '0036000291452'),
    ('15400141288763', zxingcpp.BarcodeFormat.ITF14, '15400141288763'),
])
def test_decode_barcode_on_generated_images(value: str, fmt: zxingcpp.BarcodeFormat, expected: str) -> None:
    detected = decode_barcode(open_image(_jpeg(_barcode_image(value, fmt), quality=95)))
    assert detected is not None
    assert detected.value == expected


def test_decode_barcode_ignores_qr_codes() -> None:
    qr = Image.fromarray(zxingcpp.create_barcode('4006381333931', zxingcpp.BarcodeFormat.QRCode).to_image(scale=8))
    assert decode_barcode(qr.convert('RGB')) is None


def test_decode_barcode_returns_none_without_barcode() -> None:
    assert decode_barcode(Image.new('RGB', (400, 300), 'white')) is None


# ─── Heuristiques OCR ──────────────────────────────────────────────────────


def test_propose_from_ocr_picks_dominant_line_as_name() -> None:
    proposals = propose_from_ocr(_lines(
        OcrLine(text='Lactel®', confidence=0.95, bbox=[0, 0, 200, 30]),
        OcrLine(text='Lait demi-écrémé', confidence=0.97, bbox=[0, 40, 400, 120]),
        OcrLine(text='Riche en calcium et vitamine D', confidence=0.9, bbox=[0, 130, 400, 160]),
        OcrLine(text='1 L', confidence=0.92, bbox=[0, 170, 80, 200]),
        OcrLine(text='Ingrédients : lait', confidence=0.9, bbox=[0, 210, 300, 225]),
    ))
    assert proposals.product_name is not None and proposals.product_name.value == 'Lait demi-écrémé'
    assert proposals.product_name.confidence > 0.8
    assert proposals.brand is not None and proposals.brand.value == 'Lactel'
    assert proposals.net_quantity is not None and proposals.net_quantity.value == '1 L'


def test_propose_from_ocr_takes_name_from_face_and_quantity_from_back() -> None:
    proposals = propose_from_ocr([
        ScanTextLine(text='Thé vert', confidence=0.95, bbox=[0, 0, 300, 50], side='face'),
        ScanTextLine(text='Conseils de préparation', confidence=0.95, bbox=[0, 0, 300, 90], side='back'),
        ScanTextLine(text='Poids net 100 g', confidence=0.9, bbox=[0, 100, 300, 120], side='back'),
    ])
    assert proposals.product_name is not None and proposals.product_name.value == 'Thé vert'
    assert proposals.net_quantity is not None and proposals.net_quantity.value == '100 g'


def test_propose_from_ocr_lowers_confidence_without_dominant_line() -> None:
    proposals = propose_from_ocr(_lines(
        OcrLine(text='Biscuits', confidence=0.95, bbox=[0, 0, 200, 40]),
        OcrLine(text='Chocolat noir', confidence=0.95, bbox=[0, 50, 200, 88]),
    ))
    assert proposals.product_name is not None
    assert proposals.product_name.confidence < 0.7


def test_propose_from_ocr_prefers_quantity_on_net_line() -> None:
    proposals = propose_from_ocr(_lines(
        OcrLine(text='Pour 100 g : 450 kcal', confidence=0.9, bbox=[0, 0, 300, 80]),
        OcrLine(text='Poids net 250 g', confidence=0.9, bbox=[0, 100, 300, 120]),
    ))
    assert proposals.net_quantity is not None and proposals.net_quantity.value == '250 g'


def test_propose_from_ocr_empty() -> None:
    proposals = propose_from_ocr([])
    assert proposals.product_name is None and proposals.brand is None
    assert proposals.net_quantity is None


# ─── Préparation de l'image ────────────────────────────────────────────────


def test_prepare_for_provider_resizes_and_strips_exif() -> None:
    exif = Image.Exif()
    exif[0x010F] = 'PhoneMaker'           # Make
    exif[0x8825] = {2: (48.0, 51.0, 24.0)}  # GPSInfo : latitude
    original = _jpeg(Image.new('RGB', (4000, 3000), 'red'), exif=exif)
    assert Image.open(io.BytesIO(original)).getexif()

    prepared = Image.open(io.BytesIO(prepare_for_provider(open_image(original))))
    assert prepared.format == 'JPEG'
    assert max(prepared.size) == PROVIDER_MAX_SIDE_PX
    assert not prepared.getexif()
    assert 'exif' not in prepared.info and 'icc_profile' not in prepared.info


def test_prepare_for_provider_keeps_small_images() -> None:
    prepared = Image.open(io.BytesIO(prepare_for_provider(open_image(_jpeg(Image.new('RGB', (800, 600)))))))
    assert prepared.size == (800, 600)


def test_open_image_applies_exif_orientation() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation : rotation de 90°
    image = open_image(_jpeg(Image.new('RGB', (400, 200)), exif=exif))
    assert image.size == (200, 400)


# ─── Endpoint /internal/product-scan ───────────────────────────────────────


def test_product_scan_requires_internal_key() -> None:
    response = client.post('/internal/product-scan', files={'image': ('a', b'\xff\xd8\xff', 'image/jpeg')})
    assert response.status_code == 401


def test_product_scan_reads_barcode_and_text() -> None:
    content = _jpeg(_barcode_image('4006381333931', zxingcpp.BarcodeFormat.EAN13), quality=95)
    ocr = _ocr_result(OcrLine(text='Crayons de couleur', confidence=0.95, bbox=[0, 0, 300, 60]))
    seen_paths: list[str] = []

    def fake_ocr(path: str) -> OcrExtractionResult:
        seen_paths.append(path)
        assert os.path.exists(path)
        return ocr

    with patch('app.product_scan.extract_text_from_image', side_effect=fake_ocr), \
         patch('app.config.VISION_PROVIDER', 'none'):
        response = _post('/internal/product-scan', content)
    assert response.status_code == 200
    body = response.json()
    assert body['barcode'] == {'value': '4006381333931', 'confidence': 1.0}
    assert body['barcode_format'] == 'EAN-13'
    assert body['product_name']['value'] == 'Crayons de couleur'
    assert body['claims'] == [] and body['variant'] is None
    assert body['structuring'] == 'disabled'
    assert body['vision_available'] is False
    # Le fichier temporaire exigé par PaddleOCR est supprimé après lecture.
    assert seen_paths and not os.path.exists(seen_paths[0])


def test_product_scan_deletes_temp_file_on_ocr_error() -> None:
    from app.ocr import OcrEngineError

    seen_paths: list[str] = []

    def failing_ocr(path: str) -> OcrExtractionResult:
        seen_paths.append(path)
        raise OcrEngineError('boom')

    with patch('app.product_scan.extract_text_from_image', side_effect=failing_ocr):
        response = _post('/internal/product-scan', _jpeg(Image.new('RGB', (100, 100))))
    assert response.status_code == 500
    assert response.json() == {'detail': 'Erreur interne du moteur OCR.'}
    assert not os.path.exists(seen_paths[0])


@pytest.mark.parametrize(('content', 'mime'), [
    (b'%PDF-1.7 ...', 'application/pdf'),
    (b'GIF89a......', 'image/gif'),
    (b'not a jpeg at all', 'image/jpeg'),
])
def test_product_scan_rejects_non_images(content: bytes, mime: str) -> None:
    assert _post('/internal/product-scan', content, mime).status_code == 400


def test_product_scan_rejects_oversized_image() -> None:
    content = b'\xff\xd8\xff' + b'\x00' * (8 * 1024 * 1024)
    response = _post('/internal/product-scan', content)
    assert response.status_code == 400
    assert '8 Mo' in response.json()['detail']


def test_product_scan_rejects_corrupted_image() -> None:
    response = _post('/internal/product-scan', b'\xff\xd8\xff\xe0' + b'\x00' * 64)
    assert response.status_code == 400
    assert response.json() == {'detail': 'Image illisible.'}


# ─── Registre des fournisseurs ─────────────────────────────────────────────


def test_registry_none_disables_vision() -> None:
    with patch('app.config.VISION_PROVIDER', 'none'):
        assert get_provider() is None


def test_registry_unknown_provider_disables_vision(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING), patch('app.config.VISION_PROVIDER', 'mystery'):
        assert get_provider() is None
    assert 'Unknown VISION_PROVIDER' in caplog.text


def test_registry_openai_without_key_disables_vision() -> None:
    with patch('app.config.VISION_PROVIDER', 'openai'), patch('app.config.OPENAI_API_KEY', ''):
        assert get_provider() is None


def test_registry_openai_with_key_returns_configured_provider() -> None:
    with patch('app.config.VISION_PROVIDER', 'openai'), patch('app.config.OPENAI_API_KEY', _TEST_OPENAI_KEY), \
         patch('app.config.VISION_MODEL', 'model-x'), patch('app.config.VISION_TIMEOUT_SECONDS', 12.0), \
         patch('app.config.PRODUCT_TEXT_MODEL', 'text-y'), patch('app.config.PRODUCT_TEXT_TIMEOUT_SECONDS', 8.0):
        provider = get_provider()
    assert isinstance(provider, OpenAIVisionProvider)
    assert provider._model == 'model-x' and provider._timeout == 12.0
    assert provider._text_model == 'text-y' and provider._text_timeout == 8.0


def test_registry_explicit_name_overrides_config() -> None:
    with patch('app.config.VISION_PROVIDER', 'none'), patch('app.config.OPENAI_API_KEY', _TEST_OPENAI_KEY):
        assert isinstance(get_provider('openai'), OpenAIVisionProvider)
        assert get_provider('none') is None


def test_fake_provider_satisfies_protocol() -> None:
    provider: ProductVisionProvider = FakeProvider()
    assert provider.extract(b'x', 'image/jpeg').product_name == 'Lait demi-écrémé'
    assert provider.structure([]).brand == 'Lactel'


# ─── Endpoint /internal/product-scan/vision ────────────────────────────────


def _post_vision(
    provider: FakeProvider | None, content: bytes | None = None, *, image_fallback: bool = True,
) -> httpx.Response:
    with patch('app.product_scan.get_provider', return_value=provider), \
         patch('app.config.PRODUCT_SCAN_IMAGE_FALLBACK', image_fallback):
        return _post('/internal/product-scan/vision', content or _jpeg(Image.new('RGB', (3000, 2000))))


def test_vision_routes_cleaned_image_to_provider() -> None:
    exif = Image.Exif()
    exif[0x8825] = {2: (48.0, 51.0, 24.0)}
    provider = FakeProvider()
    response = _post_vision(provider, _jpeg(Image.new('RGB', (3000, 2000)), exif=exif))
    assert response.status_code == 200
    assert response.json()['product_name'] == 'Lait demi-écrémé'
    [(sent, mime)] = provider.calls
    assert mime == 'image/jpeg'
    sent_image = Image.open(io.BytesIO(sent))
    assert max(sent_image.size) <= PROVIDER_MAX_SIDE_PX
    assert not sent_image.getexif()


def test_vision_disabled_returns_503() -> None:
    response = _post_vision(None)
    assert response.status_code == 503
    assert response.json() == {'detail': 'Secours vision non configuré.'}


def test_vision_refused_without_image_fallback_even_with_provider() -> None:
    provider = FakeProvider()
    response = _post_vision(provider, image_fallback=False)
    assert response.status_code == 503
    assert provider.calls == []


def test_vision_provider_failure_returns_generic_502() -> None:
    response = _post_vision(FakeProvider(error=VisionProviderError('timeout')))
    assert response.status_code == 502
    assert response.json() == {'detail': 'Fournisseur de vision indisponible.'}


def test_vision_result_is_sanitized() -> None:
    provider = FakeProvider(ProductReading(
        product_name='  Jus   d’orange  ', variant='', net_quantity='1,5 L', barcode='4006381333932',
        claims=['  Sans sucres   ajoutés ', ''], confidence=7.0,
    ))
    body = _post_vision(provider).json()
    assert body['product_name'] == 'Jus d’orange'
    assert body['variant'] is None
    assert body['net_quantity'] == '1,5 L'
    assert body['barcode'] is None  # clé de contrôle fausse
    assert body['claims'] == ['Sans sucres ajoutés']
    assert body['confidence'] == 1.0


def test_vision_unreadable_quantity_becomes_null() -> None:
    body = _post_vision(FakeProvider(ProductReading(product_name='Thé', net_quantity='beaucoup'))).json()
    assert body['net_quantity'] is None
    assert body['confidence'] == 0.6


# ─── Fournisseur OpenAI ────────────────────────────────────────────────────


def _openai_provider(mock_client: MagicMock, model: str = 'gpt-5-mini') -> OpenAIVisionProvider:
    provider = OpenAIVisionProvider(api_key=_TEST_OPENAI_KEY, model=model, timeout=30)
    provider._client = lambda timeout: mock_client  # type: ignore[method-assign]
    return provider


def _fake_httpx_request() -> httpx.Request:
    return httpx.Request('POST', 'https://api.openai.com/v1/responses')


def test_openai_provider_sends_image_input_without_storage() -> None:
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(
        output_parsed=ProductReading(product_name='Thé vert'), usage=None,
    )
    result = _openai_provider(mock_client).extract(b'jpeg-bytes', 'image/jpeg')
    assert result.product_name == 'Thé vert'
    kwargs = mock_client.responses.parse.call_args.kwargs
    assert kwargs['store'] is False
    assert kwargs['text_format'] is ProductReading
    assert kwargs['reasoning'] == {'effort': 'minimal'}
    system, user = kwargs['input']
    assert system == {'role': 'system', 'content': PRODUCT_VISION_SYSTEM_PROMPT}
    image_part = user['content'][1]
    assert image_part['type'] == 'input_image'
    assert image_part['image_url'] == 'data:image/jpeg;base64,anBlZy1ieXRlcw=='


def test_openai_provider_omits_reasoning_for_other_models() -> None:
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(output_parsed=ProductReading(), usage=None)
    _openai_provider(mock_client, model='gpt-4.1-mini').extract(b'x', 'image/jpeg')
    assert 'reasoning' not in mock_client.responses.parse.call_args.kwargs


def test_openai_client_disables_sdk_retries() -> None:
    provider = OpenAIVisionProvider(api_key=_TEST_OPENAI_KEY, model='m', timeout=30)
    with patch('openai.OpenAI') as openai_cls:
        provider._client(30)
    openai_cls.assert_called_once_with(api_key=_TEST_OPENAI_KEY, timeout=30, max_retries=0)


def _openai_errors() -> list[Exception]:
    from openai import APIConnectionError, APITimeoutError, RateLimitError

    request = _fake_httpx_request()
    return [
        APITimeoutError(request=request),
        APIConnectionError(request=request),
        RateLimitError('rate limited', response=httpx.Response(429, request=request), body=None),
    ]


@pytest.mark.parametrize('error', _openai_errors())
def test_openai_provider_maps_errors_without_leaking(error: Exception, caplog: pytest.LogCaptureFixture) -> None:
    mock_client = MagicMock()
    mock_client.responses.parse.side_effect = error
    with caplog.at_level(logging.DEBUG), pytest.raises(VisionProviderError) as raised:
        _openai_provider(mock_client).extract(_SECRET_TEXT.encode(), 'image/jpeg')
    assert str(raised.value) == 'Fournisseur de vision indisponible.'
    assert _TEST_OPENAI_KEY not in caplog.text
    assert _SECRET_TEXT not in caplog.text


def test_openai_provider_missing_parsed_output_raises() -> None:
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(output_parsed=None, usage=None)
    with pytest.raises(VisionProviderError):
        _openai_provider(mock_client).extract(b'x', 'image/jpeg')


def test_openai_provider_logs_usage_but_no_content(caplog: pytest.LogCaptureFixture) -> None:
    usage = MagicMock()
    usage.model_dump.return_value = {'input_tokens': 1105, 'output_tokens': 42}
    mock_client = MagicMock()
    mock_client.responses.parse.return_value = MagicMock(
        output_parsed=ProductReading(product_name=_SECRET_TEXT, claims=[_SECRET_TEXT]), usage=usage,
    )
    image = _SECRET_TEXT.encode()
    with caplog.at_level(logging.DEBUG):
        _openai_provider(mock_client).extract(image, 'image/jpeg')
    assert 'provider=openai' in caplog.text
    assert 'model=gpt-5-mini' in caplog.text
    assert "'input_tokens': 1105" in caplog.text
    assert _SECRET_TEXT not in caplog.text
    assert PRODUCT_VISION_SYSTEM_PROMPT not in caplog.text
