"""Client HTTP vers le service IA (FastAPI).

Deux surfaces :

- `check_ai_service_*` : sondes GET simples sur `/health` et `/internal/health`
  — implémentées avec `urllib.request` (aucune dépendance, aucune surface
  d'attaque étendue) ;
- `extract_text_with_ai_service` : POST multipart d'une image vers
  `/internal/ocr/extract-text` — implémenté avec `httpx` parce que le
  multipart binaire et le timeout par phase sont pénibles à écrire à la main.

Le client vit dans l'app `ocr` parce qu'il n'a de sens que pour ce domaine.
Dès que d'autres domaines auront besoin d'appeler le service IA (V6+), on
extraira une abstraction — pas avant, règle du rule of three.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any, NamedTuple
from urllib.parse import urljoin

import httpx
from django.conf import settings

if TYPE_CHECKING:
    from collections.abc import Mapping

logger = logging.getLogger(__name__)


__all__ = (
    'INTERNAL_API_KEY_HEADER',
    'AiOcrExtraction',
    'AiOcrLine',
    'AiServiceHealth',
    'AiServiceUnavailableError',
    'check_ai_service_authenticated_health',
    'check_ai_service_health',
    'extract_text_with_ai_service',
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
    headers: Mapping[str, str] | None = None,
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
    except TimeoutError as exc:
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


# ─── Extraction OCR ────────────────────────────────────────────────────────
#
# Contrat serveur (`POST /internal/ocr/extract-text`) — voir
# `apps/ai-service/app/schemas.py::OcrExtractionResult`.
#
#     {
#       "raw_text": str,
#       "confidence_score": float,      # [0.0, 1.0]
#       "lines": [
#         {"text": str, "confidence": float, "bbox": [int, int, int, int] | []},
#         ...
#       ]
#     }
#
# On valide strictement ce contrat : tout écart → `AiServiceUnavailableError`.
# On ne relaie *jamais* un dict brut vers la couche métier : le typage rend
# les erreurs visibles à la compilation plutôt qu'au runtime en prod.


class AiOcrLine(NamedTuple):
    text: str
    confidence: float
    bbox: list[int]


class AiOcrExtraction(NamedTuple):
    raw_text: str
    confidence_score: float
    lines: list[AiOcrLine]


def _coerce_confidence(value: Any) -> float:
    """Convertit + borne un score de confiance à [0.0, 1.0].

    Défensif : Paddle borne déjà les scores côté ai-service, mais on
    re-vérifie ici — un contrat qui déraille silencieusement en prod
    est plus difficile à débugger qu'un `AiServiceUnavailableError`.
    """
    try:
        score = float(value)
    except (TypeError, ValueError) as exc:
        raise AiServiceUnavailableError('Réponse invalide du service IA.') from exc
    if not (0.0 <= score <= 1.0):
        raise AiServiceUnavailableError('Réponse invalide du service IA.')
    return score


def _parse_bbox(raw: Any) -> list[int]:
    """La bbox est optionnelle : liste vide autorisée, valeurs entières."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise AiServiceUnavailableError('Réponse invalide du service IA.')
    if not raw:
        return []
    if len(raw) != 4:
        raise AiServiceUnavailableError('Réponse invalide du service IA.')
    try:
        return [int(v) for v in raw]
    except (TypeError, ValueError) as exc:
        raise AiServiceUnavailableError('Réponse invalide du service IA.') from exc


def _parse_extraction(payload: Any) -> AiOcrExtraction:
    if not isinstance(payload, dict):
        raise AiServiceUnavailableError('Réponse invalide du service IA.')
    lines_raw = payload.get('lines')
    if not isinstance(lines_raw, list):
        raise AiServiceUnavailableError('Réponse invalide du service IA.')

    lines: list[AiOcrLine] = []
    for entry in lines_raw:
        if not isinstance(entry, dict):
            raise AiServiceUnavailableError('Réponse invalide du service IA.')
        text = entry.get('text')
        if not isinstance(text, str):
            raise AiServiceUnavailableError('Réponse invalide du service IA.')
        lines.append(AiOcrLine(
            text=text,
            confidence=_coerce_confidence(entry.get('confidence')),
            bbox=_parse_bbox(entry.get('bbox')),
        ))

    raw_text = payload.get('raw_text')
    if not isinstance(raw_text, str):
        raise AiServiceUnavailableError('Réponse invalide du service IA.')

    return AiOcrExtraction(
        raw_text=raw_text,
        confidence_score=_coerce_confidence(payload.get('confidence_score')),
        lines=lines,
    )


def extract_text_with_ai_service(
    *,
    content: bytes,
    filename: str,
    mime_type: str,
) -> AiOcrExtraction:
    """POST du binaire vers `/internal/ocr/extract-text`, réponse typée.

    - Ne relève *jamais* la clé API dans un message d'erreur.
    - Convertit toute erreur transport/HTTP/JSON en `AiServiceUnavailableError`
      pour que la tâche Celery ait un seul type d'exception à gérer.
    - Timeout dédié (`AI_SERVICE_OCR_TIMEOUT_SECONDS`) : l'inférence prend
      plusieurs secondes et déclenche parfois le chargement à froid du
      pipeline PaddleOCR côté serveur, très supérieur aux 5 s des sondes.
    """
    url = _build_url('/internal/ocr/extract-text')
    headers = {INTERNAL_API_KEY_HEADER: settings.AI_SERVICE_API_KEY}
    files = {'document': (filename, content, mime_type)}
    timeout = settings.AI_SERVICE_OCR_TIMEOUT_SECONDS

    try:
        response = httpx.post(url, headers=headers, files=files, timeout=timeout)
    except httpx.TimeoutException as exc:
        logger.warning('AI service OCR timeout')
        raise AiServiceUnavailableError('Service IA : délai dépassé.') from exc
    except httpx.HTTPError as exc:
        logger.warning('AI service OCR transport error: %r', exc)
        raise AiServiceUnavailableError('Service IA injoignable.') from exc

    if response.status_code >= 500:
        logger.warning('AI service OCR HTTP error: status=%s', response.status_code)
        raise AiServiceUnavailableError(
            f'Service IA a renvoyé une erreur HTTP {response.status_code}.'
        )
    if response.status_code >= 400:
        # 4xx = binaire refusé (taille, signature) ; on remonte quand même en
        # `AiServiceUnavailableError` — la tâche marquera l'OCR en `failed`
        # avec un message générique. Détail dans les logs uniquement.
        logger.warning('AI service OCR rejected upload: status=%s', response.status_code)
        raise AiServiceUnavailableError(
            f'Service IA a refusé le document (HTTP {response.status_code}).'
        )

    try:
        payload = response.json()
    except json.JSONDecodeError as exc:
        logger.warning('AI service OCR returned invalid JSON')
        raise AiServiceUnavailableError('Réponse invalide du service IA.') from exc

    return _parse_extraction(payload)
