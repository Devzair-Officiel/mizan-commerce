from unittest import mock

from django.db import OperationalError
from django.test import TestCase


def _ok() -> None:
    return None


def _database_down() -> None:
    raise OperationalError('connection to server at "postgres", user "mizan" failed')


# Redis simulé : les tests ne dépendent pas d'un Redis joignable.
@mock.patch.dict('apps.core.health._CHECKS', {'redis': _ok})
class HealthzTest(TestCase):
    def test_ok_without_authentication(self) -> None:
        response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_answers_whatever_the_host(self) -> None:
        # Sondes Docker sur 127.0.0.1 : hôte absent d'ALLOWED_HOSTS.
        response = self.client.get('/healthz', HTTP_HOST='127.0.0.1:8000')
        self.assertEqual(response.status_code, 200)

    def test_failure_reveals_nothing(self) -> None:
        with (
            mock.patch.dict('apps.core.health._CHECKS', {'database': _database_down}),
            self.assertLogs('apps.core.health', level='ERROR') as logs,
        ):
            response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'error'})
        self.assertNotIn('postgres', response.content.decode())
        # Le log nomme la dépendance et le type d'erreur, pas le message.
        self.assertEqual(
            logs.output,
            [
                'ERROR:apps.core.health:'
                'healthz : database indisponible (OperationalError)'
            ],
        )

    def test_redis_failure(self) -> None:
        def redis_down() -> None:
            raise ConnectionError('Error 111 connecting to redis:6379')

        with (
            mock.patch.dict('apps.core.health._CHECKS', {'redis': redis_down}),
            self.assertLogs('apps.core.health', level='ERROR'),
        ):
            response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 503)

    def test_only_get_and_head(self) -> None:
        self.assertEqual(self.client.head('/healthz').status_code, 200)
        self.assertEqual(self.client.post('/healthz').status_code, 405)

    def test_trailing_slash_is_not_the_health_route(self) -> None:
        self.assertEqual(self.client.get('/healthz/').status_code, 404)
