"""Vérification des tokens reCAPTCHA v3 côté serveur.

Si `RECAPTCHA_SECRET_KEY` est vide (dev / tests), la vérification est désactivée
et renvoie toujours True — pratique pour ne pas exiger la clé en local.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
TIMEOUT_SECONDS = 5


def verify_recaptcha_token(token: str, expected_action: str) -> bool:
    """Vérifie un token reCAPTCHA v3 auprès de Google.

    - Désactivé silencieusement si `RECAPTCHA_SECRET_KEY` n'est pas configuré.
    - Vérifie que `success=True`, que `action` correspond, et que `score >=
      RECAPTCHA_MIN_SCORE`.
    """
    secret = getattr(settings, 'RECAPTCHA_SECRET_KEY', '')
    if not secret:
        return True

    if not token:
        return False

    payload = urllib.parse.urlencode({'secret': secret, 'response': token}).encode()
    request = urllib.request.Request(VERIFY_URL, data=payload)

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        logger.warning('recaptcha verify failed: %s', exc)
        return False

    if not data.get('success'):
        return False
    if data.get('action') != expected_action:
        return False

    min_score = getattr(settings, 'RECAPTCHA_MIN_SCORE', 0.5)
    return float(data.get('score', 0)) >= float(min_score)
