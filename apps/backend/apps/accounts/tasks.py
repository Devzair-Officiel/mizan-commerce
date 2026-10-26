"""Tâches Celery du compte."""

from celery import shared_task
from django.core.management import call_command


@shared_task
def flush_expired_tokens() -> None:
    """Supprime les jetons de rafraîchissement expirés et leur entrée de liste noire.

    Un jeton expiré est refusé par sa date : sa ligne ne sert plus à rien.
    """
    call_command('flushexpiredtokens')
