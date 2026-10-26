"""Blocage d'un compte par django-axes après des échecs de connexion (login JWT).

AXES_LOCKOUT_PARAMETERS = [['username', 'ip_address']] : blocage du couple
(compte, adresse du visiteur). AXES_FAILURE_LIMIT = 5.
"""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import caches
from django.test import TestCase
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.response import Response
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


ADDRESS = '203.0.113.7'


class CoupleLockoutTest(TestCase):
    """Blocage du couple (compte, adresse) : 429 au-delà de la limite, autres
    couples libres, adresse du visiteur lue comme la limitation de DRF."""

    def setUp(self) -> None:
        caches['throttle'].clear()
        self.client = APIClient()
        self.alice = User.objects.create_user(
            email='alice@example.com', password=PASSWORD,
        )
        User.objects.create_user(email='bob@example.com', password=PASSWORD)

    def _login(
        self, email: str, password: str, address: str = ADDRESS,
        forwarded: str | None = None,
    ) -> Response:
        # Derrière Next.js, REMOTE_ADDR est celle du conteneur : seule la
        # dernière entrée de X-Forwarded-For désigne le visiteur.
        return self.client.post(
            reverse('auth-login'), {'email': email, 'password': password},
            REMOTE_ADDR='172.18.0.5', HTTP_X_FORWARDED_FOR=forwarded or address,
        )

    def _fail_up_to_limit(self, email: str, address: str = ADDRESS) -> None:
        for _ in range(settings.AXES_FAILURE_LIMIT):
            self.assertEqual(
                self._login(email, 'mauvais', address).status_code,
                status.HTTP_401_UNAUTHORIZED,
            )

    def _assert_locked(self, response: Response) -> None:
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['code'], 'too_many_attempts')
        retry_after = response.data['retry_after']
        self.assertGreater(retry_after, 0)
        self.assertLessEqual(retry_after, settings.AXES_COOLOFF_TIME.total_seconds())
        self.assertEqual(response['Retry-After'], str(retry_after))

    def test_same_credentials_locked_after_limit(self) -> None:
        self._fail_up_to_limit('alice@example.com')
        # Même le bon mot de passe est refusé pendant le blocage.
        self._assert_locked(self._login('alice@example.com', PASSWORD))

    def test_unknown_account_gets_the_same_response(self) -> None:
        # Deux adresses : la limite 'auth' de DRF (10/minute) reste hors de cause.
        self._fail_up_to_limit('alice@example.com')
        self._fail_up_to_limit('inconnu@example.com', '198.51.100.1')
        known = self._login('alice@example.com', 'mauvais')
        unknown = self._login('inconnu@example.com', 'mauvais', '198.51.100.1')
        self._assert_locked(known)
        self._assert_locked(unknown)
        self.assertEqual(known.data['detail'], unknown.data['detail'])

    def test_same_account_from_another_address_is_not_locked(self) -> None:
        self._fail_up_to_limit('alice@example.com')
        self.assertEqual(
            self._login('alice@example.com', PASSWORD, '198.51.100.1').status_code,
            status.HTTP_200_OK,
        )

    def test_failures_on_many_accounts_do_not_lock_another_account(self) -> None:
        for i in range(settings.AXES_FAILURE_LIMIT):
            self.assertEqual(
                self._login(f'inconnu{i}@example.com', 'mauvais').status_code,
                status.HTTP_401_UNAUTHORIZED,
            )
        self.assertEqual(
            self._login('bob@example.com', PASSWORD).status_code, status.HTTP_200_OK,
        )

    def test_forged_forwarded_for_does_not_change_the_key(self) -> None:
        # Le visiteur préfixe des adresses de son choix ; le proxy ajoute la
        # vraie en dernier : c'est elle qui compte, comme pour DRF.
        for i in range(settings.AXES_FAILURE_LIMIT):
            self.assertEqual(
                self._login(
                    'alice@example.com', 'mauvais', forwarded=f'10.0.0.{i}, {ADDRESS}',
                ).status_code,
                status.HTTP_401_UNAUTHORIZED,
            )
        self._assert_locked(
            self._login(
                'alice@example.com', PASSWORD, forwarded=f'10.9.9.9, {ADDRESS}',
            ),
        )

    def test_addresses_of_one_ipv6_64_count_together(self) -> None:
        for i in range(settings.AXES_FAILURE_LIMIT):
            self._login('alice@example.com', 'mauvais', f'2001:db8:1:2::{i + 1:x}')
        self._assert_locked(
            self._login(
                'alice@example.com', PASSWORD, '2001:db8:1:2:ffff:ffff:ffff:ffff',
            ),
        )
        # Un autre /64 : couple distinct.
        self.assertEqual(
            self._login('alice@example.com', PASSWORD, '2001:db8:1:3::1').status_code,
            status.HTTP_200_OK,
        )

    def test_password_reset_lifts_the_lock(self) -> None:
        self._fail_up_to_limit('alice@example.com')
        self._assert_locked(self._login('alice@example.com', PASSWORD))
        new_password = 'NewStrongPass456!'
        response = self.client.post(reverse('auth-password-reset-confirm'), {
            'uid': urlsafe_base64_encode(force_bytes(self.alice.pk)),
            'token': default_token_generator.make_token(self.alice),
            'new_password': new_password,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self._login('alice@example.com', new_password).status_code,
            status.HTTP_200_OK,
        )

    def test_successful_login_resets_the_counter(self) -> None:
        for _ in range(settings.AXES_FAILURE_LIMIT - 1):
            self._login('alice@example.com', 'mauvais')
        self.assertEqual(
            self._login('alice@example.com', PASSWORD).status_code, status.HTTP_200_OK,
        )
        # Compteur remis à zéro : quatre nouveaux échecs restent sous la limite.
        for _ in range(settings.AXES_FAILURE_LIMIT - 1):
            self.assertEqual(
                self._login('alice@example.com', 'mauvais').status_code,
                status.HTTP_401_UNAUTHORIZED,
            )
