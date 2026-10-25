"""Limitation de débit partagée : cache 'throttle', panne de Redis, IP du visiteur."""

from unittest import mock

from django.core.cache import caches
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import URLPattern, URLResolver, get_resolver, reverse
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework import status, throttling
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.throttles import AuthRateThrottle
from apps.core.throttling import SharedCacheThrottleMixin
from config.settings.base import _redis_url_with_db

EMAIL = 'throttle@example.com'
PASSWORD = 'StrongPass123!'


def _views(patterns: list, found: list | None = None) -> list:
    """Classes de vue DRF de toutes les routes."""
    found = [] if found is None else found
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            _views(pattern.url_patterns, found)
        elif isinstance(pattern, URLPattern):
            view = getattr(pattern.callback, 'cls', None)
            if view is not None and hasattr(view, 'throttle_classes'):
                found.append(view)
    return found


def _project_throttles(base: type = throttling.BaseThrottle) -> set[type]:
    found = set()
    for sub in base.__subclasses__():
        if sub.__module__.startswith('apps.'):
            found.add(sub)
        found |= _project_throttles(sub)
    return found


class SharedCacheCoverageTest(SimpleTestCase):
    def test_every_route_throttle_uses_the_shared_cache(self) -> None:
        views = _views(get_resolver().url_patterns)
        self.assertGreater(len(views), 20)
        for view in views:
            for throttle in view.throttle_classes:
                with self.subTest(view=view.__name__, throttle=throttle.__name__):
                    self.assertTrue(issubclass(throttle, SharedCacheThrottleMixin))

    def test_every_project_throttle_class_uses_the_shared_cache(self) -> None:
        get_resolver().url_patterns  # charge toutes les vues, donc leurs limitations
        throttles = _project_throttles() - {SharedCacheThrottleMixin}
        self.assertGreaterEqual(len(throttles), 8)
        for throttle in throttles:
            with self.subTest(throttle=throttle.__name__):
                self.assertTrue(issubclass(throttle, SharedCacheThrottleMixin))

    def test_counters_live_in_the_throttle_cache(self) -> None:
        self.assertIs(AuthRateThrottle.cache._connections, caches)
        self.assertEqual(AuthRateThrottle.cache._alias, 'throttle')


class RedisUrlTest(SimpleTestCase):
    def test_keeps_host_and_password_changes_database(self) -> None:
        self.assertEqual(
            _redis_url_with_db('redis://:s3cret@redis:6379/0', 1),
            'redis://:s3cret@redis:6379/1',
        )
        self.assertEqual(_redis_url_with_db('redis://redis:6379', 1), 'redis://redis:6379/1')  # noqa: E501


class ThrottleTestCase(TestCase):
    def setUp(self) -> None:
        caches['throttle'].clear()
        self.client = APIClient()
        self.user = User.objects.create_user(email=EMAIL, password=PASSWORD)

    def _refresh(self, **extra: str):
        # Rafraîchissement refusé (401) : limite 'auth' par IP, sans le blocage
        # d'axes qu'entraîneraient des mots de passe faux.
        return self.client.post(
            reverse('auth-token-refresh'), {'refresh': 'pas-un-jeton'}, **extra,
        )


class DegradedCacheTest(ThrottleTestCase):
    """Redis en panne : la requête passe, avertissement journalisé sans donnée."""

    def _assert_fails_open(self, logs) -> None:
        self.assertTrue(logs.output)
        for line in logs.output:
            self.assertIn('requête acceptée', line)
            for secret in (EMAIL, '127.0.0.1', '203.0.113.7', 's3cret'):
                self.assertNotIn(secret, line)

    def test_cache_error_lets_the_request_through(self) -> None:
        failure = RedisConnectionError('s3cret')
        with mock.patch.object(caches['throttle'], 'get', side_effect=failure), \
                self.assertLogs('apps.core.throttling', 'WARNING') as logs:
            # Au-delà de la limite 'auth' (10/minute) : aucune 429, aucune 500.
            codes = {
                self._refresh(HTTP_X_FORWARDED_FOR='203.0.113.7').status_code
                for _ in range(12)
            }
        self.assertEqual(codes, {status.HTTP_401_UNAUTHORIZED})
        self._assert_fails_open(logs)

    def test_write_error_lets_authenticated_requests_through(self) -> None:
        self.client.force_authenticate(self.user)
        failure = ConnectionError()
        with mock.patch.object(caches['throttle'], 'set', side_effect=failure), \
                self.assertLogs('apps.core.throttling', 'WARNING') as logs:
            response = self.client.get(reverse('auth-me'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._assert_fails_open(logs)

    @override_settings(CACHES={
        'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
        'throttle': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': 'redis://:s3cret@127.0.0.1:1/1',  # aucun Redis sur ce port
            'OPTIONS': {'socket_connect_timeout': 1, 'socket_timeout': 1},
        },
    })
    def test_unreachable_redis_lets_the_request_through(self) -> None:
        with self.assertLogs('apps.core.throttling', 'WARNING') as logs:
            response = self._refresh()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self._assert_fails_open(logs)


class ClientAddressTest(ThrottleTestCase):
    """IP d'un visiteur : dernière entrée de X-Forwarded-For (NUM_PROXIES = 1)."""

    def test_each_forwarded_address_has_its_own_counter(self) -> None:
        for _ in range(10):
            self._refresh(HTTP_X_FORWARDED_FOR='203.0.113.7')
        self.assertEqual(
            self._refresh(HTTP_X_FORWARDED_FOR='203.0.113.7').status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.assertEqual(
            self._refresh(HTTP_X_FORWARDED_FOR='198.51.100.4').status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_address_prepended_by_the_client_is_ignored(self) -> None:
        for i in range(10):
            self._refresh(HTTP_X_FORWARDED_FOR=f'10.0.0.{i}, 203.0.113.7')
        self.assertEqual(
            self._refresh(HTTP_X_FORWARDED_FOR='10.9.9.9, 203.0.113.7').status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
