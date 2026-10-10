"""Authentification JWT de l'API : point unique de suspension des membres.

Une boutique qui quitte Boutique+ garde ses employés et ses admins, mais ils ne
peuvent plus rien faire : chaque requête authentifiée est refusée avec le code
`staff_suspended_plan`, quelle que soit la vue. La connexion (`/auth/login/`) et le
rafraîchissement du jeton n'authentifient pas : ils réussissent, et l'app affiche
l'écran « Accès suspendu » à la première requête refusée.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import ShopMember
from .services import is_member_suspended

if TYPE_CHECKING:
    from rest_framework.request import Request
    from rest_framework_simplejwt.tokens import Token

    from apps.accounts.models import User

STAFF_SUSPENDED_CODE = 'staff_suspended_plan'


class StaffSuspended(PermissionDenied):
    default_code = STAFF_SUSPENDED_CODE

    def __init__(self) -> None:
        super().__init__({
            'detail': "Accès suspendu : la boutique n'a plus la formule Boutique+.",
            'code': STAFF_SUSPENDED_CODE,
        })


class ShopMemberJWTAuthentication(JWTAuthentication):
    """JWT standard, puis refus des membres suspendus (403, code dédié)."""

    def authenticate(self, request: Request) -> tuple[User, Token] | None:
        result = super().authenticate(request)
        if result is None:
            return None
        # Même membre que `core.permissions.get_member` (premier par clé primaire).
        member = (
            ShopMember.objects.filter(user=result[0])
            .select_related('shop__subscription__plan')
            .first()
        )
        if member is not None and is_member_suspended(member):
            raise StaffSuspended()
        return result
