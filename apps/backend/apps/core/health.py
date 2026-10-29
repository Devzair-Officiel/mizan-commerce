"""Route de santé `/healthz` : la base et Redis répondent-ils ?

Sans authentification, elle ne renvoie qu'un statut (`ok` ou `error`), jamais
de détail interne : la dépendance en échec n'est écrite que dans les logs.
Middleware placé en tête de MIDDLEWARE : les sondes Docker appellent
`http://127.0.0.1:8000/healthz`, un hôte absent d'ALLOWED_HOSTS, et la réponse
part avant toute validation de l'hôte.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

import redis
from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse, JsonResponse

logger = logging.getLogger(__name__)

HEALTH_PATH = '/healthz'
_TIMEOUT_SECONDS = 2


def _check_database() -> None:
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')


def _check_redis() -> None:
    client = redis.Redis.from_url(
        settings.CELERY_BROKER_URL,
        socket_connect_timeout=_TIMEOUT_SECONDS,
        socket_timeout=_TIMEOUT_SECONDS,
    )
    try:
        client.ping()
    finally:
        client.close()


_CHECKS: dict[str, Callable[[], None]] = {
    'database': _check_database,
    'redis': _check_redis,
}


def dependencies_healthy() -> bool:
    """Vrai si toutes les dépendances répondent.

    Un échec est journalisé sans son message.
    """
    healthy = True
    for name, check in _CHECKS.items():
        try:
            check()
        except Exception as exc:  # toute erreur rend la route indisponible
            # Le type seul : un message d'erreur peut contenir un hôte, un utilisateur.
            logger.error('healthz : %s indisponible (%s)', name, type(exc).__name__)
            healthy = False
    return healthy


class HealthCheckMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.path != HEALTH_PATH:
            return self.get_response(request)
        if request.method not in ('GET', 'HEAD'):
            return JsonResponse({'status': 'error'}, status=405)
        if dependencies_healthy():
            return JsonResponse({'status': 'ok'})
        return JsonResponse({'status': 'error'}, status=503)
