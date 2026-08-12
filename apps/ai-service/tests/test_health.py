"""Tests du service IA — health public + auth interne.

On patche `app.config.API_KEY` plutôt que de dépendre d'une vraie variable
d'environnement : les tests deviennent hermétiques et ne fuitent jamais de
secret dans les logs CI.
"""
from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.security import INTERNAL_API_KEY_HEADER

client = TestClient(app)

_TEST_API_KEY = 'test-internal-key-do-not-use-in-prod'


# ─── /health public ────────────────────────────────────────────────────────


def test_health_returns_200_and_expected_contract() -> None:
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'service': 'mizan-ai'}


def test_health_does_not_require_api_key() -> None:
    with patch('app.config.API_KEY', ''):
        response = client.get('/health')
    assert response.status_code == 200


# ─── /internal/health protégé ──────────────────────────────────────────────


def test_internal_health_without_key_returns_401() -> None:
    with patch('app.config.API_KEY', _TEST_API_KEY):
        response = client.get('/internal/health')
    assert response.status_code == 401
    assert _TEST_API_KEY not in response.text


def test_internal_health_with_wrong_key_returns_401() -> None:
    with patch('app.config.API_KEY', _TEST_API_KEY):
        response = client.get(
            '/internal/health',
            headers={INTERNAL_API_KEY_HEADER: 'wrong-key'},
        )
    assert response.status_code == 401
    assert _TEST_API_KEY not in response.text


def test_internal_health_with_valid_key_returns_200() -> None:
    with patch('app.config.API_KEY', _TEST_API_KEY):
        response = client.get(
            '/internal/health',
            headers={INTERNAL_API_KEY_HEADER: _TEST_API_KEY},
        )
    assert response.status_code == 200
    assert response.json() == {
        'status': 'ok',
        'service': 'mizan-ai',
        'authenticated': True,
    }


def test_internal_health_never_leaks_expected_key_in_error() -> None:
    """Aucun code path 401 ne doit renvoyer la clé attendue."""
    with patch('app.config.API_KEY', _TEST_API_KEY):
        for headers in (
            {},
            {INTERNAL_API_KEY_HEADER: ''},
            {INTERNAL_API_KEY_HEADER: 'nope'},
        ):
            response = client.get('/internal/health', headers=headers)
            assert response.status_code == 401
            assert _TEST_API_KEY not in response.text
            assert _TEST_API_KEY not in str(response.headers)


def test_internal_health_refuses_when_server_key_missing() -> None:
    """Si le serveur n'a pas de clé, aucune requête ne doit passer."""
    with patch('app.config.API_KEY', ''):
        response = client.get(
            '/internal/health',
            headers={INTERNAL_API_KEY_HEADER: 'anything'},
        )
    assert response.status_code == 401
