"""Masquage des secrets et coordonnées dans un texte sortant du serveur.

Partagé par Sentry (`apps/core/sentry.py`) et les logs JSON de production
(`apps/core/json_logging.py`). Sans dépendance à Django : gunicorn l'importe
avant que Django ne soit chargé.
"""

from __future__ import annotations

import re

FILTERED = '[Filtered]'

# Clé (dictionnaire, en-tête, paramètre d'URL) qui évoque un secret ou une
# coordonnée de client : sa valeur est remplacée par FILTERED.
_SENSITIVE_KEY = re.compile(
    r'pass|pwd|secret|token|key|auth|cookie|session|csrf|credential|signature'
    r'|dsn|uid|e-?mail|phone|t[eé]l[eé]phone|mobile|whatsapp',
    re.IGNORECASE,
)

# Paramètre d'URL dans un texte libre (message, URL complète).
_URL_PARAM = re.compile(r'([?&#]([^=&#\s]+)=)([^&#\s]*)')
_EMAIL = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')
# Format international (E.164, espaces tolérés) et national à 10 chiffres.
_PHONE = re.compile(r'\+\d(?:[ .-]?\d){7,14}|\b0\d(?:[ .-]?\d{2}){4}\b')


def is_sensitive(key: object) -> bool:
    """Vrai si le nom de clé évoque un secret ou une coordonnée."""
    return isinstance(key, str) and bool(_SENSITIVE_KEY.search(key))


def mask(text: str) -> str:
    """Remplace e-mails et téléphones par un marqueur."""
    return _PHONE.sub('[phone]', _EMAIL.sub('[email]', text))


def mask_text(text: str) -> str:
    """`mask`, plus la valeur de tout paramètre d'URL sensible (`?token=…`)."""

    def _param(match: re.Match[str]) -> str:
        prefix, name, _ = match.groups()
        return f'{prefix}{FILTERED}' if is_sensitive(name) else match.group(0)

    return mask(_URL_PARAM.sub(_param, text))
