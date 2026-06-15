from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember


class RegisterViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('auth-register')

    def test_register_creates_user_and_shop(self):
        data = {'email': 'test@example.com', 'password': 'StrongPass123!', 'full_name': 'Test User'}
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

        user = User.objects.get(email='test@example.com')
        self.assertEqual(user.full_name, 'Test User')
        self.assertTrue(ShopMember.objects.filter(user=user, role='owner').exists())

    def test_register_duplicate_email(self):
        User.objects.create_user(email='dup@example.com', password='Pass123!')
        response = self.client.post(self.url, {'email': 'dup@example.com', 'password': 'Pass123!'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_weak_password(self):
        response = self.client.post(self.url, {'email': 'weak@example.com', 'password': '123'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AuthFlowTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='user@example.com', password='StrongPass123!')

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
        self.user = User.objects.create_user(email='unverified@example.com', password='StrongPass123!')
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
    """Vérifie le bon comportement après le passage à `is_active=True` à l'inscription."""

    def setUp(self):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        self.client = APIClient()
        self.user = User.objects.create_user(email='verify@example.com', password='StrongPass123!')
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)
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
