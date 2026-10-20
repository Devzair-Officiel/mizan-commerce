"""Fournisseur OpenAI du scan d'emballage (Responses API, sortie structurée).

Même motif qu'`invoice_extraction.py` : `responses.parse` avec
`text_format=ProductReading`, `store=False`, aucun retry du SDK, timeout
borné, exceptions du SDK ramenées à `VisionProviderError`.
- `structure` : lignes OCR en `input_text`, modèle `PRODUCT_TEXT_MODEL` ;
- `extract` : image en `input_image` (data URL base64), modèle `VISION_MODEL`.
Seuls fournisseur, modèle, durée et usage en tokens sont journalisés — jamais
l'image, le texte lu ni la réponse brute.
"""
from __future__ import annotations

import base64
import logging
import time
from typing import TYPE_CHECKING, Any

from .. import config
from .base import (
    PRODUCT_TEXT_SYSTEM_PROMPT,
    PRODUCT_VISION_SYSTEM_PROMPT,
    ProductReading,
    ScanTextLine,
    VisionProviderError,
    format_scan_lines,
)

if TYPE_CHECKING:
    from openai import OpenAI

logger = logging.getLogger(__name__)

PROVIDER_NAME = 'openai'

# `high` : le texte d'un emballage est petit, `low` (512 px) le rend illisible.
# Coût à mesurer pendant les essais (usage journalisé par appel).
_IMAGE_DETAIL = 'high'


def _reasoning_options(model: str) -> dict[str, dict[str, str]]:
    """`minimal` n'existe que sur la famille gpt-5 ; les autres modèles le refusent."""
    if model == 'gpt-5' or model.startswith('gpt-5-'):
        return {'reasoning': {'effort': 'minimal'}}
    return {}


class OpenAIVisionProvider:
    def __init__(
        self, *, api_key: str, model: str, timeout: float,
        text_model: str | None = None, text_timeout: float | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._text_model = text_model or model
        self._text_timeout = text_timeout or timeout

    def _client(self, timeout: float) -> 'OpenAI':
        from openai import OpenAI

        return OpenAI(api_key=self._api_key, timeout=timeout, max_retries=0)

    def _parse(self, *, kind: str, model: str, timeout: float, input: list[dict[str, Any]]) -> ProductReading:
        from openai import OpenAIError
        from pydantic import ValidationError

        started = time.monotonic()
        try:
            response = self._client(timeout).responses.parse(
                model=model,
                input=input,
                text_format=ProductReading,
                store=False,
                **_reasoning_options(model),
            )
        except (OpenAIError, ValidationError) as exc:
            # Timeout, réseau, 4xx/5xx, réponse tronquée ou hors schéma. Le type
            # d'erreur suffit au diagnostic ; son message peut citer la requête.
            logger.warning(
                'Product %s call failed (provider=%s, model=%s, elapsed=%.2fs, error=%s)',
                kind, PROVIDER_NAME, model, time.monotonic() - started, type(exc).__name__,
            )
            raise VisionProviderError('Fournisseur de vision indisponible.') from exc

        usage = getattr(response, 'usage', None)
        logger.info(
            'Product %s call ok (provider=%s, model=%s, elapsed=%.2fs, usage=%s)',
            kind, PROVIDER_NAME, model, time.monotonic() - started,
            usage.model_dump() if usage is not None else None,
        )
        parsed = getattr(response, 'output_parsed', None)
        if not isinstance(parsed, ProductReading):
            logger.warning('Product %s returned no parsed output (provider=%s, model=%s)', kind, PROVIDER_NAME, model)
            raise VisionProviderError('Réponse invalide du fournisseur de vision.')
        return parsed

    def structure(self, lines: list[ScanTextLine]) -> ProductReading:
        return self._parse(kind='text', model=self._text_model, timeout=self._text_timeout, input=[
            {'role': 'system', 'content': PRODUCT_TEXT_SYSTEM_PROMPT},
            {'role': 'user', 'content': [{'type': 'input_text', 'text': format_scan_lines(lines)}]},
        ])

    def extract(self, image: bytes, mime_type: str) -> ProductReading:
        data_url = f'data:{mime_type};base64,{base64.b64encode(image).decode("ascii")}'
        return self._parse(kind='vision', model=self._model, timeout=self._timeout, input=[
            {'role': 'system', 'content': PRODUCT_VISION_SYSTEM_PROMPT},
            {'role': 'user', 'content': [
                {'type': 'input_text', 'text': "Photo de l'emballage à lire."},
                {'type': 'input_image', 'image_url': data_url, 'detail': _IMAGE_DETAIL},
            ]},
        ])


def from_config() -> OpenAIVisionProvider | None:
    """Fournisseur configuré, ou `None` sans clé (scan sans IA)."""
    if not config.OPENAI_API_KEY:
        return None
    return OpenAIVisionProvider(
        api_key=config.OPENAI_API_KEY,
        model=config.VISION_MODEL,
        timeout=config.VISION_TIMEOUT_SECONDS,
        text_model=config.PRODUCT_TEXT_MODEL,
        text_timeout=config.PRODUCT_TEXT_TIMEOUT_SECONDS,
    )
