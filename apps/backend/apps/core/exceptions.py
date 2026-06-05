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
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("apps.core.exceptions")


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

    # Exception non gérée — on logge avec contexte, on renvoie un 500 générique.
    request = context.get("request")
    view = context.get("view")
    logger.exception(
        "Unhandled API exception",
        extra={
            "path": getattr(request, "path", None),
            "method": getattr(request, "method", None),
            "view": view.__class__.__name__ if view else None,
            "user_id": getattr(getattr(request, "user", None), "id", None),
        },
    )

    detail = "Une erreur interne est survenue."
    if settings.DEBUG:
        detail = f"{detail} ({exc.__class__.__name__}: {exc})"
    return Response(
        {"detail": detail},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _normalize_payload(data: Any) -> Any:
    """Garantit la présence d'une clé `detail` lisible côté client."""
    if isinstance(data, dict):
        if "detail" in data:
            return data
        # ex: erreurs de validation DRF → {"field": ["msg", ...]}.
        return {"detail": "Requête invalide.", "errors": data}
    if isinstance(data, list):
        return {"detail": "Requête invalide.", "errors": data}
    return {"detail": str(data) if data is not None else "Erreur."}
