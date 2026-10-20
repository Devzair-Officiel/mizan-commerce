"""Choix du fournisseur de vision selon `VISION_PROVIDER`.

`none`, une valeur inconnue ou une clé absente désactivent le secours : le scan
renvoie alors la lecture locale, sans jamais bloquer l'utilisateur.
"""
from __future__ import annotations

import logging
from collections.abc import Callable

from .. import config
from . import openai_provider
from .base import ProductVisionProvider

logger = logging.getLogger(__name__)

# Un fournisseur = une ligne : son nom dans `VISION_PROVIDER` → sa fabrique.
_FACTORIES: dict[str, Callable[[], ProductVisionProvider | None]] = {
    openai_provider.PROVIDER_NAME: openai_provider.from_config,
}


def get_provider() -> ProductVisionProvider | None:
    name = config.VISION_PROVIDER
    if name in ('', 'none'):
        return None
    factory = _FACTORIES.get(name)
    if factory is None:
        logger.warning('Unknown VISION_PROVIDER, vision fallback disabled')
        return None
    provider = factory()
    if provider is None:
        logger.warning('Vision provider not configured (provider=%s), fallback disabled', name)
    return provider
