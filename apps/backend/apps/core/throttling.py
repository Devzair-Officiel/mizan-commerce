"""Limitation de débit DRF sur un cache partagé (alias `throttle`, Redis en production).

Les compteurs sont communs à tous les processus Gunicorn et à tous les conteneurs
backend : une limite de 10/minute vaut 10/minute, pas 10 par processus. Toutes
les classes de limitation du projet héritent de `AnonRateThrottle` ou de
`UserRateThrottle` ci-dessous (test : `apps/core/test_throttling.py`).

Redis indisponible : la limitation s'ouvre (la requête passe) plutôt que de
renvoyer une erreur 500 sur toute l'API ; un avertissement est journalisé.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.core.cache import caches
from django.utils.connection import ConnectionProxy
from redis.exceptions import RedisError
from rest_framework import throttling

if TYPE_CHECKING:
    # rest_framework.views lit DEFAULT_THROTTLE_CLASSES (ce module) à l'import.
    from rest_framework.request import Request
    from rest_framework.views import APIView

logger = logging.getLogger(__name__)

THROTTLE_CACHE_ALIAS = 'throttle'


class SharedCacheThrottleMixin:
    """À placer avant la classe DRF : remplace son cache et rend la limitation tolérante aux pannes."""  # noqa: E501

    cache = ConnectionProxy(caches, THROTTLE_CACHE_ALIAS)
    scope: str | None

    def allow_request(self, request: Request, view: APIView) -> bool:
        try:
            return super().allow_request(request, view)  # type: ignore[misc]
        except (RedisError, OSError) as exc:
            # Ni IP, ni utilisateur, ni message d'erreur (il peut contenir l'URL Redis).
            logger.warning(
                'Limitation de débit inactive (cache %r indisponible, %s) : '
                'requête acceptée, portée %s.',
                THROTTLE_CACHE_ALIAS, type(exc).__name__, self.scope,
            )
            return True


class AnonRateThrottle(SharedCacheThrottleMixin, throttling.AnonRateThrottle):
    """Visiteurs non connectés, par adresse IP (transmise par le proxy Next.js)."""


class UserRateThrottle(SharedCacheThrottleMixin, throttling.UserRateThrottle):
    """Utilisateurs connectés, par identifiant ; IP pour un visiteur anonyme."""
