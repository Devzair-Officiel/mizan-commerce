"""Gestionnaire d'exceptions DRF anti-leak.

Objectifs :
- Toute exception non gérée par DRF est convertie en `500` générique sans
  divulguer la stack trace ou le message Python brut côté client.
- Les exceptions DRF connues (404, 400, 403…) gardent leur sémantique mais
  sont harmonisées dans une enveloppe `{"detail": "...", "errors": ...}`.
- En production, on logge la stack trace côté serveur (avec contexte requête).

À brancher via :

    REST_FRAMEWORK = {
        ...
        "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    }
"""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import IntegrityError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger('apps.core.exceptions')

# SQLSTATE PostgreSQL d'une violation de contrainte d'unicité.
_UNIQUE_VIOLATION = '23505'


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Wrapper autour de `rest_framework.views.exception_handler`.

    - Convertit les exceptions Django natives (`Http404`, `PermissionDenied`)
      en exceptions DRF.
    - Pour les erreurs non gérées (500), retourne un message générique
      et logge la trace serveur uniquement.
    """
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)

    if response is not None:
        response.data = _normalize_payload(response.data)
        return response

    request = context.get('request')
    view = context.get('view')
    log_context = {
        'path': getattr(request, 'path', None),
        'method': getattr(request, 'method', None),
        'view': view.__class__.__name__ if view else None,
        'user_id': getattr(getattr(request, 'user', None), 'id', None),
    }

    # Unicité violée malgré la validation des serializers (deux requêtes
    # simultanées) : 409 générique. Le message PostgreSQL contient les valeurs
    # en conflit : on ne logge que le nom de la contrainte.
    if _is_unique_violation(exc):
        diag = getattr(exc.__cause__, 'diag', None)
        logger.warning(
            'Unique constraint violation',
            extra={**log_context, 'constraint': getattr(diag, 'constraint_name', None)},
        )
        return Response(
            {'detail': 'Cette ressource existe déjà.'},
            status=status.HTTP_409_CONFLICT,
        )

    # Exception non gérée — on logge avec contexte, on renvoie un 500 générique.
    logger.exception('Unhandled API exception', extra=log_context)

    detail = 'Une erreur interne est survenue.'
    if settings.DEBUG:
        detail = f'{detail} ({exc.__class__.__name__}: {exc})'
    return Response(
        {'detail': detail},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _is_unique_violation(exc: Exception) -> bool:
    return (
        isinstance(exc, IntegrityError)
        and getattr(exc.__cause__, 'pgcode', None) == _UNIQUE_VIOLATION
    )


def _normalize_payload(data: Any) -> Any:
    """Garantit la présence d'une clé `detail` lisible côté client."""
    if isinstance(data, dict):
        if 'detail' in data:
            return data
        # ex: erreurs de validation DRF → {"field": ["msg", ...]}.
        return {'detail': 'Requête invalide.', 'errors': data}
    if isinstance(data, list):
        return {'detail': 'Requête invalide.', 'errors': data}
    return {'detail': str(data) if data is not None else 'Erreur.'}
