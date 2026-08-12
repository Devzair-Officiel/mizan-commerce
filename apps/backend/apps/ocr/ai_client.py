"""Client HTTP minimal vers le service IA (FastAPI).

Volontairement écrit sur la bibliothèque standard (`urllib.request`) :
- pas de nouvelle dépendance backend (requests/httpx absents à cette étape) ;
- surface d'attaque réduite ;
- suffisant pour deux appels de sonde.

Le client vit dans l'app `ocr` parce qu'il n'a de sens que pour ce domaine.
Dès que d'autres domaines auront besoin d'appeler le service IA (V6+), on
extraira une abstraction — pas avant, règle du rule of three.
"""
from __future__ import annotations

import json
import logging
import socket
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, NamedTuple
from urllib.parse import urljoin

from django.conf import settings

if TYPE_CHECKING:
    from collections.abc import Mapping

logger = logging.getLogger(__name__)


__all__ = (
    'AiServiceUnavailableError',
    'AiServiceHealth',
    'check_ai_service_health',
    'check_ai_service_authenticated_health',
    'INTERNAL_API_KEY_HEADER',
)

# Doit rester strictement identique à `apps.ai-service/app/security.py`.
INTERNAL_API_KEY_HEADER = 'X-Internal-API-Key'


class AiServiceUnavailableError(RuntimeError):
    """Le service IA est injoignable ou renvoie une réponse invalide.

    Exception domaine — englobe tous les cas où l'appel ne peut pas produire
    de résultat exploitable (timeout, connexion refusée, statut non-2xx,
    JSON invalide, réponse vide). Le message reste générique côté client :
    aucune clé, aucun secret n'y est injecté.
    """


class AiServiceHealth(NamedTuple):
    status: str
    service: str
    authenticated: bool  # True uniquement pour /internal/health


def _build_url(path: str) -> str:
    # `urljoin` gère proprement les slashes ; on force un slash final sur la
    # base pour que la résolution soit stable même si la conf est bricolée.
    base = settings.AI_SERVICE_URL
    if not base.endswith('/'):
        base = base + '/'
    return urljoin(base, path.lstrip('/'))


def _perform_request(
    path: str,
    *,
    headers: 'Mapping[str, str] | None' = None,
) -> dict:
    url = _build_url(path)
    request = urllib.request.Request(url, method='GET')
    for key, value in (headers or {}).items():
        request.add_header(key, value)

    try:
        with urllib.request.urlopen(
            request, timeout=settings.AI_SERVICE_TIMEOUT_SECONDS,
        ) as response:
            if response.status < 200 or response.status >= 300:
                # Défensif : urllib lève déjà HTTPError sur 4xx/5xx, mais on
                # garde ce garde-fou pour les cas exotiques (redirect, etc.).
                raise AiServiceUnavailableError(
                    f'Réponse inattendue du service IA (status={response.status}).'
                )
            raw = response.read()
    except urllib.error.HTTPError as exc:
        # Ne pas inclure le corps : peut contenir des détails serveur.
        logger.warning('AI service HTTP error on %s: status=%s', path, exc.code)
        raise AiServiceUnavailableError(
            f'Service IA a renvoyé une erreur HTTP {exc.code}.'
        ) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, 'reason', exc)
        logger.warning('AI service unreachable on %s: %r', path, reason)
        raise AiServiceUnavailableError('Service IA injoignable.') from exc
    except (TimeoutError, socket.timeout) as exc:
        logger.warning('AI service timeout on %s', path)
        raise AiServiceUnavailableError('Service IA : délai dépassé.') from exc

    try:
        payload = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeDecodeError) as exc:
        logger.warning('AI service returned invalid JSON on %s', path)
        raise AiServiceUnavailableError('Réponse invalide du service IA.') from exc

    if not isinstance(payload, dict):
        raise AiServiceUnavailableError('Réponse invalide du service IA.')
    return payload


def check_ai_service_health() -> AiServiceHealth:
    """Sonde publique — pas de header d'auth."""
    payload = _perform_request('/health')
    return AiServiceHealth(
        status=str(payload.get('status', '')),
        service=str(payload.get('service', '')),
        authenticated=False,
    )


def check_ai_service_authenticated_health() -> AiServiceHealth:
    """Sonde interne — envoie `X-Internal-API-Key`.

    Ne JAMAIS logger la clé ni la placer dans une exception : elle vient
    directement de `settings.AI_SERVICE_API_KEY` et reste locale à cet
    appel.
    """
    payload = _perform_request(
        '/internal/health',
        headers={INTERNAL_API_KEY_HEADER: settings.AI_SERVICE_API_KEY},
    )
    return AiServiceHealth(
        status=str(payload.get('status', '')),
        service=str(payload.get('service', '')),
        authenticated=bool(payload.get('authenticated', False)),
    )
