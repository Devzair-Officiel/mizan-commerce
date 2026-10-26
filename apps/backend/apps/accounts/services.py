"""Services du compte : mot de passe, révocation des sessions, blocage de connexion."""

from datetime import timedelta
from math import ceil

from axes.attempts import get_user_attempts, reset_user_attempts
from axes.conf import settings as axes_settings
from axes.handlers.proxy import AxesProxyHandler
from axes.helpers import get_cool_off, get_credentials
from axes.utils import reset as reset_axes_attempts
from django.db import transaction
from django.db.models import Max
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.request import Request
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.utils import aware_utcnow

from .models import User


def revoke_refresh_tokens(user: User) -> int:
    """Met sur liste noire les jetons de rafraîchissement valides de l'utilisateur.

    Les jetons d'accès déjà émis restent valides jusqu'à leur expiration
    (ACCESS_TOKEN_LIFETIME) : sans état, ils ne sont pas révocables.
    Retourne le nombre de jetons révoqués.
    """
    pending = OutstandingToken.objects.filter(
        user=user,
        expires_at__gt=aware_utcnow(),
        blacklistedtoken__isnull=True,
    ).only('id')
    revoked = BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in pending],
        ignore_conflicts=True,
    )
    return len(revoked)


@transaction.atomic
def set_password_and_revoke_sessions(user: User, new_password: str) -> None:
    """Change le mot de passe, ferme toutes les sessions en cours de l'utilisateur
    et lève le blocage de sa connexion (toutes adresses)."""
    user.set_password(new_password)
    user.save(update_fields=['password'])
    revoke_refresh_tokens(user)
    reset_axes_attempts(username=user.email)


class LoginLocked(Exception):
    """Couple (compte, adresse) bloqué par django-axes ; `retry_after` en secondes."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(retry_after)
        self.retry_after = retry_after


def ensure_login_allowed(request: HttpRequest | Request, username: str) -> None:
    """Lève `LoginLocked` si le couple (compte, adresse) est bloqué.

    Même décision que le backend d'axes, qui refuserait de toute façon la
    connexion : ici, avant le mot de passe, avec le délai restant. Rien sur
    l'existence du compte : axes compte les échecs de tout nom saisi.
    """
    if not axes_settings.AXES_ENABLED:
        return
    credentials = get_credentials(username)
    if AxesProxyHandler.is_allowed(request, credentials):
        return
    raise LoginLocked(_lockout_seconds(request, credentials))


def _lockout_seconds(request: HttpRequest | Request, credentials: dict) -> int:
    """Délai avant déblocage : dernier échec du couple + AXES_COOLOFF_TIME."""
    cool_off = get_cool_off(request) or timedelta(0)
    last_failures = [
        last for attempts in get_user_attempts(request, credentials)
        if (last := attempts.aggregate(last=Max('attempt_time'))['last'])
    ]
    remaining = (
        max(last_failures) + cool_off - timezone.now() if last_failures else cool_off
    )
    return max(1, ceil(remaining.total_seconds()))


def forget_login_failures(request: HttpRequest | Request, username: str) -> None:
    """Connexion réussie : efface les échecs du couple (AXES_RESET_ON_SUCCESS).

    Le login JWT n'émet pas `user_logged_in`, le signal par lequel axes le fait.
    """
    if axes_settings.AXES_ENABLED and axes_settings.AXES_RESET_ON_SUCCESS:
        reset_user_attempts(request, get_credentials(username))
