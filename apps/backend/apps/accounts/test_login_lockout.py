"""Blocage d'un compte par django-axes après des échecs de connexion (login JWT).

AXES_LOCKOUT_PARAMETERS = [['username', 'ip_address']] : blocage du couple
(compte, adresse du visiteur). AXES_FAILURE_LIMIT = 5.
"""

from django.conf import settings
from django.core.cache import caches
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User

PASSWORD = 'StrongPass123!'


class UsernameLockoutTest(TestCase):
    def setUp(self) -> None:
        caches['throttle'].clear()  # limite 'auth' (par IP) hors de cause
        self.client = APIClient()
        User.objects.create_user(email='alice@example.com', password=PASSWORD)
        User.objects.create_user(email='bob@example.com', password=PASSWORD)

    def _login(self, email: str, password: str, address: str) -> int:
        # Adresse différente pour axes (REMOTE_ADDR) comme pour la limitation
        # de DRF (X-Forwarded-For) : aucun compteur par adresse n'atteint la limite.
        return self.client.post(
            reverse('auth-login'), {'email': email, 'password': password},
            REMOTE_ADDR=address, HTTP_X_FORWARDED_FOR=address,
        ).status_code

    def test_failures_spread_over_addresses_do_not_lock_the_account(self) -> None:
        for i in range(settings.AXES_FAILURE_LIMIT):
            self.assertEqual(
                self._login('alice@example.com', 'mauvais', f'203.0.113.{i + 1}'),
                status.HTTP_401_UNAUTHORIZED,
            )
        # Une adresse de plus : aucun couple (compte, adresse) à la limite.
        self.assertEqual(
            self._login('alice@example.com', PASSWORD, '198.51.100.1'),
            status.HTTP_200_OK,
        )

    def test_below_limit_the_right_password_still_works(self) -> None:
        for i in range(settings.AXES_FAILURE_LIMIT - 1):
            self._login('alice@example.com', 'mauvais', f'203.0.113.{i + 1}')
        self.assertEqual(
            self._login('alice@example.com', PASSWORD, '198.51.100.1'),
            status.HTTP_200_OK,
        )
