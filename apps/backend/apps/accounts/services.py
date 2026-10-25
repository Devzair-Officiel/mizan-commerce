"""Services du compte : mot de passe et révocation des sessions."""

from django.db import transaction
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
    """Change le mot de passe et ferme toutes les sessions en cours de l'utilisateur."""
    user.set_password(new_password)
    user.save(update_fields=['password'])
    revoke_refresh_tokens(user)
