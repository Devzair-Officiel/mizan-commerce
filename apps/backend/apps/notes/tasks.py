from celery import shared_task

from .services import run_automatic_reminders as run


@shared_task
def run_automatic_reminders() -> dict[str, int]:
    """Tâche horaire : relances d'impayés, commandes en attente et résumé du jour,
    à l'heure locale de chaque boutique."""
    return run()
