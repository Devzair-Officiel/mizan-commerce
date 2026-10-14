"""Suivi des erreurs (Sentry), désactivé tant que SENTRY_DSN n'est pas défini.

Aucune donnée personnelle ni secret ne part : pas de PII par défaut, ni corps
de requête ni variables locales, et `scrub_event` nettoie chaque événement avant
l'envoi (en-têtes d'authentification, clés sensibles, e-mails et téléphones).
Vérification : `python manage.py sentry_check`.
"""
from __future__ import annotations

import os
import re
from collections.abc import Mapping
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.redis import RedisIntegration

FILTERED = '[Filtered]'

# En-têtes retirés de chaque événement.
_DROPPED_HEADERS = frozenset({
    'authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-csrftoken',
})

# Clé (dictionnaire, en-tête, paramètre d'URL) qui évoque un secret ou une
# coordonnée de client : sa valeur est remplacée par FILTERED.
_SENSITIVE_KEY = re.compile(
    r'pass|pwd|secret|token|key|auth|cookie|session|csrf|credential|signature'
    r'|dsn|uid|e-?mail|phone|t[eé]l[eé]phone|mobile|whatsapp',
    re.IGNORECASE,
)

_EMAIL = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')
# Format international (E.164, espaces tolérés) et national à 10 chiffres.
_PHONE = re.compile(r'\+\d(?:[ .-]?\d){7,14}|\b0\d(?:[ .-]?\d{2}){4}\b')


def _mask(text: str) -> str:
    return _PHONE.sub('[phone]', _EMAIL.sub('[email]', text))


def _is_sensitive(key: object) -> bool:
    return isinstance(key, str) and bool(_SENSITIVE_KEY.search(key))


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: FILTERED if _is_sensitive(key) else _scrub(item)
            for key, item in value.items()
        }
    if isinstance(value, list | tuple):
        return [_scrub(item) for item in value]
    if isinstance(value, str):
        return _mask(value)
    return value


def _scrub_query(query: str) -> str:
    pairs = []
    for pair in query.split('&'):
        name, sep, raw = pair.partition('=')
        value = FILTERED if sep and _is_sensitive(name) else _mask(raw)
        pairs.append(f'{name}{sep}{value}')
    return '&'.join(pairs)


def _scrub_request(request: dict[str, Any]) -> None:
    request.pop('data', None)
    request.pop('cookies', None)
    headers = request.get('headers')
    if isinstance(headers, dict):
        request['headers'] = {
            name: value for name, value in headers.items()
            if name.lower() not in _DROPPED_HEADERS
        }
    if isinstance(request.get('query_string'), str):
        request['query_string'] = _scrub_query(request['query_string'])
    url = request.get('url')
    if isinstance(url, str) and '?' in url:
        base, _, query = url.partition('?')
        request['url'] = f'{base}?{_scrub_query(query)}'


def scrub_event(
    event: dict[str, Any], hint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """`before_send` : retire ou masque tout ce qui ne doit pas quitter le serveur."""
    if isinstance(event.get('request'), dict):
        _scrub_request(event['request'])
    return _scrub(event)


def init_sentry(environ: Mapping[str, str] = os.environ) -> bool:
    """Initialise Sentry si SENTRY_DSN est défini. Renvoie True s'il est actif.

    Jamais pendant pytest (PYTEST_VERSION) : les erreurs provoquées par les
    tests ne partent pas, même avec un DSN dans le .env.
    """
    dsn = environ.get('SENTRY_DSN', '').strip()
    if not dsn or environ.get('PYTEST_VERSION'):
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=environ.get('SENTRY_ENVIRONMENT', '').strip() or 'local',
        release=environ.get('SENTRY_RELEASE', '').strip() or None,
        integrations=[DjangoIntegration(), CeleryIntegration(), RedisIntegration()],
        send_default_pii=False,
        max_request_body_size='never',
        include_local_variables=False,
        traces_sample_rate=float(environ.get('SENTRY_TRACES_SAMPLE_RATE', '') or 0),
        before_send=scrub_event,
        before_send_transaction=scrub_event,
    )
    return True
