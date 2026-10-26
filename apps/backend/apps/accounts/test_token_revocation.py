"""Révocation des jetons de rafraîchissement : rotation, déconnexion, mot de passe."""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import caches
from django.test import TestCase
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import aware_utcnow

from apps.accounts.models import User
from apps.accounts.services import revoke_refresh_tokens
from apps.accounts.tasks import flush_expired_tokens

PASSWORD = 'StrongPass123!'


class TokenRevocationTestCase(TestCase):
    def setUp(self) -> None:
        # Connexion, rafraîchissement, déconnexion : même limite 'auth' (10/min).
        caches['throttle'].clear()
        self.client = APIClient()
        self.user = User.objects.create_user(email='session@example.com', password=PASSWORD)  # noqa: E501

    def _login(self) -> dict[str, str]:
        response = self.client.post(reverse('auth-login'), {
            'email': 'session@example.com', 'password': PASSWORD,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _refresh(self, refresh: str):
        return self.client.post(reverse('auth-token-refresh'), {'refresh': refresh})

    def _me(self, access: str):
        return self.client.get(reverse('auth-me'), HTTP_AUTHORIZATION=f'Bearer {access}')  # noqa: E501


class RotationTest(TokenRevocationTestCase):
    def test_login_registers_outstanding_token(self):
        tokens = self._login()
        jti = RefreshToken(tokens['refresh'])['jti']
        self.assertTrue(OutstandingToken.objects.filter(user=self.user, jti=jti).exists())  # noqa: E501

    def test_refresh_rotates_token(self):
        first = self._login()['refresh']
        response = self._refresh(first)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.data['refresh'], first)
        self.assertEqual(self._me(response.data['access']).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_reused_refresh_token_is_refused(self):
        first = self._login()['refresh']
        second = self._refresh(first).data['refresh']
        self.assertEqual(self._refresh(first).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501
        # La rotation suivante reste possible avec le nouveau jeton.
        self.assertEqual(self._refresh(second).status_code, status.HTTP_200_OK)


class LogoutTest(TokenRevocationTestCase):
    def test_logout_blacklists_refresh_token(self):
        tokens = self._login()
        response = self.client.post(reverse('auth-logout'), {'refresh': tokens['refresh']})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._refresh(tokens['refresh']).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501

    def test_logout_keeps_other_sessions(self):
        phone, laptop = self._login(), self._login()
        self.client.post(reverse('auth-logout'), {'refresh': phone['refresh']})
        self.assertEqual(self._refresh(laptop['refresh']).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_logout_rejects_invalid_token(self):
        response = self.client.post(reverse('auth-logout'), {'refresh': 'pas-un-jeton'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordChangeRevocationTest(TokenRevocationTestCase):
    def _change_password(self, access: str):
        return self.client.post(reverse('auth-change-password'), {
            'old_password': PASSWORD, 'new_password': 'NewStrongPass456!',
        }, HTTP_AUTHORIZATION=f'Bearer {access}')

    def test_change_password_revokes_every_session(self):
        phone, laptop = self._login(), self._login()
        response = self._change_password(phone['access'])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for old in (phone['refresh'], laptop['refresh']):
            self.assertEqual(self._refresh(old).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501

    def test_change_password_returns_a_new_session(self):
        response = self._change_password(self._login()['access'])
        self.assertEqual(self._me(response.data['access']).status_code, status.HTTP_200_OK)  # noqa: E501
        self.assertEqual(self._refresh(response.data['refresh']).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_wrong_old_password_revokes_nothing(self):
        tokens = self._login()
        response = self.client.post(reverse('auth-change-password'), {
            'old_password': 'wrong', 'new_password': 'NewStrongPass456!',
        }, HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._refresh(tokens['refresh']).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_password_reset_revokes_every_session(self):
        tokens = self._login()
        self.user.refresh_from_db()  # le jeton de réinitialisation dépend de last_login
        response = self.client.post(reverse('auth-password-reset-confirm'), {
            'uid': urlsafe_base64_encode(force_bytes(self.user.pk)),
            'token': default_token_generator.make_token(self.user),
            'new_password': 'NewStrongPass456!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._refresh(tokens['refresh']).status_code, status.HTTP_401_UNAUTHORIZED)  # noqa: E501


class RevokeRefreshTokensTest(TestCase):
    def test_revokes_only_the_users_valid_tokens(self):
        user = User.objects.create_user(email='a@example.com', password=PASSWORD)
        other = User.objects.create_user(email='b@example.com', password=PASSWORD)
        RefreshToken.for_user(user)
        RefreshToken.for_user(user)
        kept = RefreshToken.for_user(other)

        self.assertEqual(revoke_refresh_tokens(user), 2)
        self.assertEqual(BlacklistedToken.objects.filter(token__user=user).count(), 2)
        self.assertFalse(BlacklistedToken.objects.filter(token__jti=kept['jti']).exists())  # noqa: E501
        # Deuxième appel : rien de plus à révoquer.
        self.assertEqual(revoke_refresh_tokens(user), 0)


class FlushExpiredTokensTest(TestCase):
    def test_deletes_expired_tokens_and_their_blacklist_entry(self):
        user = User.objects.create_user(email='flush@example.com', password=PASSWORD)
        now = aware_utcnow()
        expired = OutstandingToken.objects.create(
            user=user, jti='expired', token='x', created_at=now - timedelta(days=31),
            expires_at=now - timedelta(days=1),
        )
        BlacklistedToken.objects.create(token=expired)
        valid = RefreshToken.for_user(user)

        flush_expired_tokens()

        self.assertFalse(OutstandingToken.objects.filter(jti='expired').exists())
        self.assertFalse(BlacklistedToken.objects.filter(token__jti='expired').exists())
        self.assertTrue(OutstandingToken.objects.filter(jti=valid['jti']).exists())

    def test_scheduled_daily(self):
        tasks = {entry['task'] for entry in settings.CELERY_BEAT_SCHEDULE.values()}
        self.assertIn('apps.accounts.tasks.flush_expired_tokens', tasks)
