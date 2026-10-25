from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.crypto import constant_time_compare
from django.utils.http import base36_to_int


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Jeton du lien de vérification d'e-mail.

    Contrairement au jeton de réinitialisation du mot de passe, il ne dépend ni
    de `last_login` ni du mot de passe : une connexion (même sur un autre
    appareil) ou un changement de mot de passe avant le clic ne l'invalide pas.
    Il ne dépend pas non plus de `email_verified_at` : un second clic reste
    valide et la vérification idempotente. Changer d'adresse l'invalide.
    Durée de validité : `settings.EMAIL_VERIFICATION_TIMEOUT` (secondes).
    """

    key_salt = 'apps.accounts.tokens.EmailVerificationTokenGenerator'

    def _make_hash_value(self, user: AbstractBaseUser, timestamp: int) -> str:
        return f'{user.pk}{user.email}{timestamp}'

    def check_token(self, user: AbstractBaseUser | None, token: str | None) -> bool:
        # Même contrôle que Django, mais `check_token` du parent compare la date à
        # PASSWORD_RESET_TIMEOUT : la durée de ce jeton a son propre réglage.
        if not (user and token):
            return False
        try:
            ts_b36, _ = token.split('-')
            ts = base36_to_int(ts_b36)
        except ValueError:
            return False

        for secret in [self.secret, *self.secret_fallbacks]:
            expected = self._make_token_with_timestamp(user, ts, secret)
            if constant_time_compare(expected, token):
                break
        else:
            return False

        age = self._num_seconds(self._now()) - ts
        return age <= settings.EMAIL_VERIFICATION_TIMEOUT


email_verification_token = EmailVerificationTokenGenerator()
