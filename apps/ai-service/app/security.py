"""Authentification service-to-service pour les endpoints internes.

Une seule dépendance réutilisable : `require_internal_api_key`. Elle lit le
header `X-Internal-API-Key`, le compare à `AI_SERVICE_API_KEY` avec
`hmac.compare_digest` pour éviter les timing attacks, et lève un 401
générique dans tous les cas invalides — sans jamais logger ni renvoyer la
valeur attendue.
"""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from . import config

INTERNAL_API_KEY_HEADER = 'X-Internal-API-Key'


def _unauthorized() -> HTTPException:
    # Message générique volontaire : ne dit ni « clé absente » ni « mauvaise
    # clé » pour ne pas aider un scan à distinguer les deux cas.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Authentification interne requise.',
    )


def require_internal_api_key(
    x_internal_api_key: str | None = Header(default=None, alias=INTERNAL_API_KEY_HEADER),
) -> None:
    """Refuse toute requête sans clé ou avec une clé qui ne matche pas.

    Si `AI_SERVICE_API_KEY` n'est pas configuré côté serveur, on refuse
    systématiquement plutôt que d'ouvrir l'endpoint : mieux vaut un 401
    parlant à l'opérateur qu'un endpoint interne accidentellement public.
    """
    expected = config.API_KEY
    if not expected or not x_internal_api_key:
        raise _unauthorized()
    if not hmac.compare_digest(x_internal_api_key, expected):
        raise _unauthorized()
