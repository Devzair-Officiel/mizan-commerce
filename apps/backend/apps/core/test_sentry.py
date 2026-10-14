from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase

from apps.core.sentry import FILTERED, init_sentry, scrub_event


def django_event() -> dict:
    return {
        'message': (
            'Échec pour jean.dupont@example.com (+33 6 12 34 56 78, 06 12 34 56 78)'
        ),
        'request': {
            'url': 'https://api.mizan.dev/api/auth/verify-email/?uid=MQ&token=abc-123',
            'query_string': 'uid=MQ&token=abc-123&page=2',
            'headers': {
                'Authorization': 'Bearer eyJhbGciOi',
                'Cookie': 'access=eyJ; csrftoken=xyz',
                'X-Api-Key': 'k-123',
                'User-Agent': 'Mozilla/5.0',
            },
            'cookies': {'access': 'eyJ'},
            'data': {'password': 'Mizan1234!', 'email': 'jean@example.com'},
        },
        'extra': {
            'password': 'Mizan1234!',
            'nested': {
                'refresh_token': 'r', 'api_key': 'k', 'SECRET_KEY': 's', 'count': 3,
            },
            'customer': {
                'name': 'Jean', 'email': 'jean@example.com', 'phone': '+212600000000',
            },
        },
        'breadcrumbs': {'values': [{'message': 'Relance envoyée à karima@example.ma'}]},
    }


class ScrubEventTest(SimpleTestCase):
    def setUp(self) -> None:
        self.event = scrub_event(django_event(), {})

    def test_auth_headers_body_and_cookies_are_removed(self) -> None:
        request = self.event['request']
        self.assertEqual(
            request['headers'], {'X-Api-Key': FILTERED, 'User-Agent': 'Mozilla/5.0'},
        )
        self.assertNotIn('data', request)
        self.assertNotIn('cookies', request)

    def test_sensitive_keys_are_filtered_at_any_depth(self) -> None:
        extra = self.event['extra']
        self.assertEqual(extra['password'], FILTERED)
        self.assertEqual(
            extra['nested'],
            {
                'refresh_token': FILTERED, 'api_key': FILTERED, 'SECRET_KEY': FILTERED,
                'count': 3,
            },
        )
        self.assertEqual(
            extra['customer'], {'name': 'Jean', 'email': FILTERED, 'phone': FILTERED},
        )

    def test_url_tokens_are_filtered(self) -> None:
        request = self.event['request']
        self.assertEqual(
            request['query_string'], f'uid={FILTERED}&token={FILTERED}&page=2',
        )
        self.assertNotIn('abc-123', request['url'])

    def test_emails_and_phones_are_masked_in_text(self) -> None:
        self.assertEqual(
            self.event['message'], 'Échec pour [email] ([phone], [phone])',
        )
        breadcrumb = self.event['breadcrumbs']['values'][0]
        self.assertEqual(breadcrumb['message'], 'Relance envoyée à [email]')

    def test_no_secret_value_survives(self) -> None:
        dumped = repr(self.event)
        secrets = ('eyJ', 'Mizan1234!', 'abc-123', 'k-123', '@example', '600000000')
        for secret in secrets:
            self.assertNotIn(secret, dumped)


class InitSentryTest(SimpleTestCase):
    def test_no_init_without_dsn(self) -> None:
        with mock.patch('apps.core.sentry.sentry_sdk.init') as init:
            self.assertFalse(init_sentry({}))
            self.assertFalse(init_sentry({'SENTRY_DSN': '  '}))
        init.assert_not_called()

    def test_no_init_under_pytest(self) -> None:
        with mock.patch('apps.core.sentry.sentry_sdk.init') as init:
            self.assertFalse(init_sentry({'SENTRY_DSN': 'https://k@o1.ingest.sentry.io/1', 'PYTEST_VERSION': '8'}))  # noqa: E501
        init.assert_not_called()

    def test_init_with_dsn_sends_no_pii(self) -> None:
        environ = {
            'SENTRY_DSN': 'https://k@o1.ingest.sentry.io/1',
            'SENTRY_ENVIRONMENT': 'staging',
            'SENTRY_RELEASE': '11ac5a3',
            'SENTRY_TRACES_SAMPLE_RATE': '0.1',
        }
        with mock.patch('apps.core.sentry.sentry_sdk.init') as init:
            self.assertTrue(init_sentry(environ))
        options = init.call_args.kwargs
        self.assertEqual(options['environment'], 'staging')
        self.assertEqual(options['release'], '11ac5a3')
        self.assertEqual(options['traces_sample_rate'], 0.1)
        self.assertFalse(options['send_default_pii'])
        self.assertEqual(options['max_request_body_size'], 'never')
        self.assertFalse(options['include_local_variables'])
        self.assertIs(options['before_send'], scrub_event)

    def test_defaults(self) -> None:
        with mock.patch('apps.core.sentry.sentry_sdk.init') as init:
            init_sentry({'SENTRY_DSN': 'https://k@o1.ingest.sentry.io/1'})
        options = init.call_args.kwargs
        self.assertEqual(options['environment'], 'local')
        self.assertIsNone(options['release'])
        self.assertEqual(options['traces_sample_rate'], 0)


class SentryCheckCommandTest(SimpleTestCase):
    def test_refuses_without_dsn(self) -> None:
        with self.assertRaisesMessage(CommandError, "SENTRY_DSN n'est pas défini"):
            call_command('sentry_check')

    def test_sends_a_test_event_when_active(self) -> None:
        client = mock.Mock(options={'environment': 'staging'})
        client.is_active.return_value = True
        with (
            mock.patch('sentry_sdk.get_client', return_value=client),
            mock.patch('sentry_sdk.capture_message', return_value='e1') as capture,
            mock.patch('sentry_sdk.flush'),
        ):
            call_command('sentry_check')
        capture.assert_called_once()
