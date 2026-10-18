from __future__ import annotations

from celery import shared_task


@shared_task
def send_zakat_reminders() -> dict[str, int]:
    """Tâche quotidienne : e-mail à chaque personne, 7 jours avant son jour J."""
    from .services import send_hawl_reminders

    return {'reminder_emails_sent': send_hawl_reminders()}
