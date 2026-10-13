from django.core.management.base import BaseCommand

from apps.notes.services import run_automatic_reminders


class Command(BaseCommand):
    help = (
        "Lance une fois les rappels automatiques (tâche horaire de Celery Beat) : "
        "relances d'impayés, commandes en attente, résumé du jour."
    )

    def handle(self, *args, **options) -> None:
        totals = run_automatic_reminders()
        for name, count in totals.items():
            self.stdout.write(f'{name}: {count}')
