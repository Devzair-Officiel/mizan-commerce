from celery import shared_task

from .services import expire_quotes as expire


@shared_task
def expire_quotes() -> int:
    """Tâche horaire : devis envoyés dont la validité est passée, à la date
    locale de chaque boutique ; renvoie le nombre de devis expirés."""
    return expire()
