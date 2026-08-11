"""Tâches Celery du module OCR.

À cette étape, le module n'exécute aucune reconnaissance : on ne pose que
l'infrastructure (queue dédiée `ocr`, worker isolé, autodiscovery). La seule
tâche exposée est un healthcheck permettant de vérifier de bout en bout que
le worker `celery-ocr` est bien démarré, qu'il consomme la queue attendue
et qu'il exécute nos tâches sans toucher aux données métier.
"""
from __future__ import annotations

from celery import shared_task
from django.utils import timezone


@shared_task(name='apps.ocr.tasks.ocr_worker_healthcheck')
def ocr_worker_healthcheck() -> dict[str, str]:
    """Sonde du worker OCR — ne modifie rien, ne contacte rien.

    Retourne un petit dict sérialisable qui prouve que la tâche a bien été
    exécutée par un worker Celery. Utile pour valider le déploiement du
    service `celery-ocr` sans avoir à orchestrer une vraie image.
    """
    return {
        'status': 'ok',
        'worker': 'ocr',
        'checked_at': timezone.now().isoformat(),
    }
