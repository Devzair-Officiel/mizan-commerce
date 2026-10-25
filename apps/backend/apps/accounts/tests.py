from django.core import mail
from django.core.cache import caches
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import ShopMember


class RegisterViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('auth-register')

    def test_register_creates_user_and_shop(self):
        data = {'email': 'test@example.com', 'password': 'StrongPass123!', 'full_name': 'Test User'}  # noqa: E501
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

        user = User.objects.get(email='test@example.com')
        self.assertEqual(user.full_name, 'Test User')
        self.assertTrue(ShopMember.objects.filter(user=user, role='owner').exists())

    def test_register_duplicate_email(self):
        User.objects.create_user(email='dup@example.com', password='Pass123!')
        response = self.client.post(self.url, {'email': 'dup@example.com', 'password': 'Pass123!'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_weak_password(self):
        response = self.client.post(self.url, {'email': 'weak@example.com', 'password': '123'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AuthFlowTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='user@example.com', password='StrongPass123!')  # noqa: E501

    def test_login_returns_tokens(self):
        response = self.client.post(reverse('auth-login'), {
            'email': 'user@example.com',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_me_requires_auth(self):
        response = self.client.get(reverse('auth-me'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_user_data(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse('auth-me'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.user.email)
        self.assertEqual(response.data['theme_mode'], 'system')
        self.assertEqual(response.data['primary_color'], 'sage')
        self.assertEqual(response.data['background_theme'], 'cream')

    def test_me_phone_is_normalized(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('auth-me')
        response = self.client.patch(url, {'phone': '+212 612-345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone'], '+212612345678')
        response = self.client.patch(url, {'phone': '12345'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(url, {'phone': ''}, format='json')
        self.assertEqual(response.data['phone'], '')

    def test_me_persists_appearance_preferences(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(reverse('auth-me'), {
            'theme_mode': 'dark',
            'primary_color': 'purple',
            'background_theme': 'lavender',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.theme_mode, 'dark')
        self.assertEqual(self.user.primary_color, 'purple')
        self.assertEqual(self.user.background_theme, 'lavender')

        response = self.client.get(reverse('auth-me'))
        self.assertEqual(response.data['theme_mode'], 'dark')
        self.assertEqual(response.data['primary_color'], 'purple')
        self.assertEqual(response.data['background_theme'], 'lavender')

    def test_me_persists_custom_color_hex(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(reverse('auth-me'), {
            'theme_mode': 'dark',
            'primary_color': 'custom',
            'primary_color_custom_hex': '#ff6600',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.theme_mode, 'dark')
        self.assertEqual(self.user.primary_color, 'custom')
        self.assertEqual(self.user.primary_color_custom_hex, '#ff6600')

        response = self.client.get(reverse('auth-me'))
        self.assertEqual(response.data['primary_color'], 'custom')
        self.assertEqual(response.data['primary_color_custom_hex'], '#ff6600')

    def test_me_persists_sage_cream(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(reverse('auth-me'), {
            'primary_color': 'sage',
            'background_theme': 'cream',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.primary_color, 'sage')
        self.assertEqual(self.user.background_theme, 'cream')

        response = self.client.get(reverse('auth-me'))
        self.assertEqual(response.data['primary_color'], 'sage')
        self.assertEqual(response.data['background_theme'], 'cream')

    def test_me_rejects_custom_color_without_hex(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            reverse('auth-me'), {'primary_color': 'custom'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('errors', response.data)
        self.assertIn('primary_color_custom_hex', errors)

    def test_me_rejects_custom_background_without_hex(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            reverse('auth-me'), {'background_theme': 'custom'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('errors', response.data)
        self.assertIn('background_custom_hex', errors)

    def test_me_rejects_invalid_appearance_preferences(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            reverse('auth-me'), {'primary_color': 'unknown'}, format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertEqual(self.user.primary_color, 'sage')

    def test_me_remembers_sidebar_collapsed(self):
        self.client.force_authenticate(user=self.user)
        self.assertFalse(self.client.get(reverse('auth-me')).data['sidebar_collapsed'])
        response = self.client.patch(
            reverse('auth-me'), {'sidebar_collapsed': True}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.sidebar_collapsed)

    def test_change_password(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse('auth-change-password'), {
            'old_password': 'StrongPass123!',
            'new_password': 'NewStrongPass456!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewStrongPass456!'))

    def test_change_password_wrong_old(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse('auth-change-password'), {
            'old_password': 'wrong',
            'new_password': 'NewStrongPass456!',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ResendEmailVerificationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='unverified@example.com', password='StrongPass123!')  # noqa: E501
        self.url = reverse('auth-verify-email-resend')

    def test_requires_auth(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sends_email_when_not_verified(self):
        self.client.force_authenticate(user=self.user)
        mail.outbox = []
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['already_verified'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('verify-email', mail.outbox[0].body)

    def test_skips_email_when_already_verified(self):
        self.user.email_verified_at = timezone.now()
        self.user.save(update_fields=['email_verified_at'])
        self.client.force_authenticate(user=self.user)
        mail.outbox = []
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['already_verified'])
        self.assertEqual(len(mail.outbox), 0)


class EmailVerificationViewTest(TestCase):
    """Vérifie le bon comportement après le passage à `is_active=True` à l'inscription."""  # noqa: E501

    def setUp(self):
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        from apps.accounts.tokens import email_verification_token

        self.client = APIClient()
        self.user = User.objects.create_user(email='verify@example.com', password='StrongPass123!')  # noqa: E501
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = email_verification_token.make_token(self.user)
        self.url = reverse('auth-verify-email')

    def test_marks_email_verified(self):
        response = self.client.get(self.url, {'uid': self.uid, 'token': self.token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.email_verified_at)

    def test_idempotent_when_already_verified(self):
        self.user.email_verified_at = timezone.now()
        self.user.save(update_fields=['email_verified_at'])
        previous = self.user.email_verified_at
        response = self.client.get(self.url, {'uid': self.uid, 'token': self.token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        # `email_verified_at` n'est pas re-écrit si déjà rempli
        self.assertEqual(self.user.email_verified_at, previous)

    def test_rejects_invalid_token(self):
        response = self.client.get(self.url, {'uid': self.uid, 'token': 'invalid'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


def _link_params(body: str, path: str) -> dict[str, str]:
    """uid et token du lien `FRONTEND_URL/<path>?uid=…&token=…` d'un e-mail."""
    from urllib.parse import parse_qs, urlsplit

    url = next(word for word in body.split() if f'/{path}?' in word)
    query = parse_qs(urlsplit(url).query)
    return {'uid': query['uid'][0], 'token': query['token'][0]}


class EmailVerificationTokenTest(TestCase):
    """Jeton dédié : insensible à la connexion et au mot de passe, lié à l'adresse."""

    def setUp(self):
        # Inscription, connexion et réinitialisation : même limite 'auth' (10/min).
        caches['throttle'].clear()
        self.client = APIClient()
        self.url = reverse('auth-verify-email')
        mail.outbox = []
        response = self.client.post(reverse('auth-register'), {
            'email': 'link@example.com',
            'password': 'StrongPass123!',
            'full_name': 'Lien Test',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.user = User.objects.get(email='link@example.com')
        self.params = _link_params(mail.outbox[0].body, 'verify-email')

    def _verify(self, params: dict[str, str] | None = None):
        return self.client.get(self.url, params or self.params)

    def test_link_valid_after_login(self):
        response = self.client.post(reverse('auth-login'), {
            'email': 'link@example.com', 'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

        self.assertEqual(self._verify().status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.email_verified_at)

    def test_link_valid_after_password_change(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse('auth-change-password'), {
            'old_password': 'StrongPass123!', 'new_password': 'NewStrongPass456!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(user=None)

        self.assertEqual(self._verify().status_code, status.HTTP_200_OK)

    def test_link_valid_twice(self):
        self.assertEqual(self._verify().status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        verified_at = self.user.email_verified_at

        self.assertEqual(self._verify().status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email_verified_at, verified_at)

    def test_resent_link_valid(self):
        self.client.force_authenticate(user=self.user)
        mail.outbox = []
        self.assertEqual(self.client.post(reverse('auth-verify-email-resend')).status_code, status.HTTP_200_OK)  # noqa: E501
        self.client.force_authenticate(user=None)

        self.assertEqual(self._verify(_link_params(mail.outbox[0].body, 'verify-email')).status_code, status.HTTP_200_OK)  # noqa: E501

    def test_link_rejected_after_email_change(self):
        self.user.email = 'new-address@example.com'
        self.user.save(update_fields=['email'])

        response = self._verify()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lien expiré ou invalide.')
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email_verified_at)

    def test_link_rejected_when_expired(self):
        from datetime import datetime, timedelta
        from unittest import mock

        from django.conf import settings

        from apps.accounts.tokens import email_verification_token

        timeout = timedelta(seconds=settings.EMAIL_VERIFICATION_TIMEOUT)
        self.assertEqual(timeout, timedelta(days=7))
        # `_now` est le point de gel prévu par Django pour ses générateurs de jetons.
        with mock.patch.object(email_verification_token, '_now', return_value=datetime.now() + timeout - timedelta(minutes=1)):  # noqa: E501
            self.assertTrue(email_verification_token.check_token(self.user, self.params['token']))  # noqa: E501
        with mock.patch.object(email_verification_token, '_now', return_value=datetime.now() + timeout + timedelta(minutes=1)):  # noqa: E501
            response = self._verify()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lien expiré ou invalide.')
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email_verified_at)

    def test_link_rejected_for_another_user(self):
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        other = User.objects.create_user(email='other@example.com', password='StrongPass123!')  # noqa: E501
        response = self._verify({'uid': urlsafe_base64_encode(force_bytes(other.pk)), 'token': self.params['token']})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lien expiré ou invalide.')
        other.refresh_from_db()
        self.assertIsNone(other.email_verified_at)

    def test_link_rejected_when_tampered(self):
        ts, digest = self.params['token'].split('-')
        tampered = f"{ts}-{'0' if digest[0] != '0' else '1'}{digest[1:]}"
        response = self._verify({'uid': self.params['uid'], 'token': tampered})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lien expiré ou invalide.')

    def test_link_rejected_for_unknown_uid(self):
        response = self._verify({'uid': 'inconnu', 'token': self.params['token']})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lien invalide.')

    def test_password_reset_token_not_accepted(self):
        from django.contrib.auth.tokens import default_token_generator

        reset_token = default_token_generator.make_token(self.user)
        response = self._verify({'uid': self.params['uid'], 'token': reset_token})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PasswordResetTokenTest(TestCase):
    """Le lien de réinitialisation garde le jeton de Django et son comportement."""

    def setUp(self):
        caches['throttle'].clear()
        self.client = APIClient()
        self.user = User.objects.create_user(email='reset@example.com', password='StrongPass123!')  # noqa: E501
        mail.outbox = []
        response = self.client.post(reverse('auth-password-reset'), {'email': 'reset@example.com'})  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.params = _link_params(mail.outbox[0].body, 'reset-password')

    def _confirm(self, token: str):
        return self.client.post(reverse('auth-password-reset-confirm'), {
            'uid': self.params['uid'], 'token': token,
            'new_password': 'NewStrongPass456!',
        })

    def test_reset_link_still_works(self):
        from django.contrib.auth.tokens import default_token_generator

        self.assertTrue(default_token_generator.check_token(self.user, self.params['token']))  # noqa: E501
        self.assertEqual(self._confirm(self.params['token']).status_code, status.HTTP_200_OK)  # noqa: E501
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewStrongPass456!'))

    def test_reset_link_single_use(self):
        self.assertEqual(self._confirm(self.params['token']).status_code, status.HTTP_200_OK)  # noqa: E501
        response = self._confirm(self.params['token'])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lien expiré ou invalide.')

    def test_reset_link_invalidated_by_login(self):
        self.client.post(reverse('auth-login'), {'email': 'reset@example.com', 'password': 'StrongPass123!'})  # noqa: E501
        self.assertEqual(self._confirm(self.params['token']).status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501

    def test_verification_token_not_accepted(self):
        from apps.accounts.tokens import email_verification_token

        response = self._confirm(email_verification_token.make_token(self.user))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('StrongPass123!'))


class ValidityLabelTest(TestCase):
    def test_labels(self):
        from apps.accounts.formatting import validity_label

        cases = {
            7 * 86400: '7 jours', 3 * 86400: '3 jours', 86400: '24 heures',
            2 * 3600: '2 heures', 3600: '1 heure', 90 * 60: '90 minutes',
            60: '1 minute', 45: '45 secondes',
        }
        for seconds, label in cases.items():
            with self.subTest(seconds=seconds):
                self.assertEqual(validity_label(seconds), label)


class LinkValidityInEmailsTest(TestCase):
    """Chaque e-mail annonce la durée du réglage qui gouverne son lien."""

    DURATIONS = {86400: 'Ce lien est valable 24 heures.', 7 * 86400: 'Ce lien est valable 7 jours.'}  # noqa: E501

    def setUp(self):
        # Inscriptions et réinitialisations : même limite 'auth' (10/min).
        caches['throttle'].clear()
        self.client = APIClient()

    def test_register_email(self):
        for seconds, sentence in self.DURATIONS.items():
            with self.subTest(seconds=seconds), override_settings(EMAIL_VERIFICATION_TIMEOUT=seconds):  # noqa: E501
                mail.outbox = []
                response = self.client.post(reverse('auth-register'), {
                    'email': f'duree{seconds}@example.com',
                    'password': 'StrongPass123!',
                }, format='json')
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertIn(sentence, mail.outbox[0].body)

    def test_resend_email(self):
        user = User.objects.create_user(email='resend@example.com', password='StrongPass123!')  # noqa: E501
        self.client.force_authenticate(user=user)
        for seconds, sentence in self.DURATIONS.items():
            with self.subTest(seconds=seconds), override_settings(EMAIL_VERIFICATION_TIMEOUT=seconds):  # noqa: E501
                mail.outbox = []
                response = self.client.post(reverse('auth-verify-email-resend'))
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIn(sentence, mail.outbox[0].body)

    def test_password_reset_email(self):
        User.objects.create_user(email='reset@example.com', password='StrongPass123!')
        for seconds, sentence in self.DURATIONS.items():
            with self.subTest(seconds=seconds), override_settings(PASSWORD_RESET_TIMEOUT=seconds):  # noqa: E501
                mail.outbox = []
                response = self.client.post(reverse('auth-password-reset'), {'email': 'reset@example.com'})  # noqa: E501
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIn(sentence, mail.outbox[0].body)

    def test_default_durations(self):
        mail.outbox = []
        self.client.post(reverse('auth-register'), {
            'email': 'defaut@example.com', 'password': 'StrongPass123!',
        }, format='json')
        self.client.post(reverse('auth-password-reset'), {'email': 'defaut@example.com'})  # noqa: E501
        self.assertIn('Ce lien est valable 7 jours.', mail.outbox[0].body)
        self.assertIn('Ce lien est valable 3 jours.', mail.outbox[1].body)
