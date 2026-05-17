from django.test import TestCase
from django.urls import reverse
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
