"""Service IA Mizan — squelette FastAPI.

À cette étape, aucun moteur OCR / LLM n'est chargé : on pose l'infrastructure
et la communication interne sécurisée avec Django/Celery. Les endpoints se
limitent à :

- `GET /health` : sonde publique du processus, sans dépendance ni auth ;
- `GET /internal/health` : sonde protégée qui valide l'auth service-to-service.

Aucun endpoint `/ocr` n'est exposé — c'est l'objet des étapes suivantes.
"""
from __future__ import annotations

from fastapi import Depends, FastAPI

from . import config
from .security import require_internal_api_key

app = FastAPI(
    title='Mizan AI Service',
    version='0.1.0',
    docs_url=None,      # pas d'exposition Swagger sur un service interne
    redoc_url=None,
    openapi_url=None,
)


@app.get('/health')
def health() -> dict[str, str]:
    """Sonde publique — vivante = FastAPI répond.

    N'accède ni à PostgreSQL, ni à Redis, ni à aucun modèle IA. C'est
    volontairement le seul endpoint sans clé, pour permettre à un
    orchestrateur (Docker healthcheck, uptime robot interne) de vérifier
    que le processus tourne sans exposer la clé.
    """
    return {'status': 'ok', 'service': config.SERVICE_NAME}


@app.get('/internal/health', dependencies=[Depends(require_internal_api_key)])
def internal_health() -> dict[str, str | bool]:
    """Sonde interne — prouve que l'auth service-to-service fonctionne.

    Un client (Django/Celery) qui reçoit un 200 sait que sa clé est valide
    et que le service accepte ses appels internes. Utile pour diagnostiquer
    une mauvaise clé en environnement sans dérouler un vrai flux OCR.
    """
    return {
        'status': 'ok',
        'service': config.SERVICE_NAME,
        'authenticated': True,
    }
