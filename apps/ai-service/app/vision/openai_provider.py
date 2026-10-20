"""Fournisseur de vision OpenAI (Responses API, sortie structurée).

Même motif qu'`invoice_extraction.py` : `responses.parse` avec
`text_format=ProductVisionResult`, `store=False`, aucun retry du SDK, timeout
borné, exceptions du SDK ramenées à `VisionProviderError`. L'image part en
`input_image` (data URL base64) ; seuls fournisseur, modèle, durée et usage en
tokens sont journalisés — jamais l'image, le texte lu ni la réponse brute.
"""
from __future__ import annotations

import base64
import logging
import time
from typing import TYPE_CHECKING

from .. import config
from .base import PRODUCT_VISION_SYSTEM_PROMPT, ProductVisionResult, VisionProviderError

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
    def __init__(self, *, api_key: str, model: str, timeout: float) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout = timeout

    def _client(self) -> 'OpenAI':
        from openai import OpenAI

        return OpenAI(api_key=self._api_key, timeout=self._timeout, max_retries=0)

    def extract(self, image: bytes, mime_type: str) -> ProductVisionResult:
        from openai import OpenAIError
        from pydantic import ValidationError

        data_url = f'data:{mime_type};base64,{base64.b64encode(image).decode("ascii")}'
        started = time.monotonic()
        try:
            response = self._client().responses.parse(
                model=self._model,
                input=[
                    {'role': 'system', 'content': PRODUCT_VISION_SYSTEM_PROMPT},
                    {'role': 'user', 'content': [
                        {'type': 'input_text', 'text': "Photo de l'emballage à lire."},
                        {'type': 'input_image', 'image_url': data_url, 'detail': _IMAGE_DETAIL},
                    ]},
                ],
                text_format=ProductVisionResult,
                store=False,
                **_reasoning_options(self._model),
            )
        except (OpenAIError, ValidationError) as exc:
            # Timeout, réseau, 4xx/5xx, réponse tronquée ou hors schéma. Le type
            # d'erreur suffit au diagnostic ; son message peut citer la requête.
            logger.warning(
                'Product vision call failed (provider=%s, model=%s, elapsed=%.2fs, error=%s)',
                PROVIDER_NAME, self._model, time.monotonic() - started, type(exc).__name__,
            )
            raise VisionProviderError('Fournisseur de vision indisponible.') from exc

        usage = getattr(response, 'usage', None)
        logger.info(
            'Product vision call ok (provider=%s, model=%s, elapsed=%.2fs, usage=%s)',
            PROVIDER_NAME, self._model, time.monotonic() - started,
            usage.model_dump() if usage is not None else None,
        )
        parsed = getattr(response, 'output_parsed', None)
        if not isinstance(parsed, ProductVisionResult):
            logger.warning('Product vision returned no parsed output (provider=%s, model=%s)', PROVIDER_NAME, self._model)
            raise VisionProviderError('Réponse invalide du fournisseur de vision.')
        return parsed


def from_config() -> OpenAIVisionProvider | None:
    """Fournisseur configuré, ou `None` sans clé (secours désactivé)."""
    if not config.OPENAI_API_KEY:
        return None
    return OpenAIVisionProvider(
        api_key=config.OPENAI_API_KEY,
        model=config.VISION_MODEL,
        timeout=config.VISION_TIMEOUT_SECONDS,
    )
