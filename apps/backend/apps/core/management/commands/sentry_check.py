"""
Envoie un événement de test à Sentry pour vérifier la configuration.

Sans SENTRY_DSN, Sentry est désactivé : la commande le dit et échoue
(code de sortie 1), aucun événement n'est envoyé.

Usage :
    docker compose exec backend python manage.py sentry_check
"""

import sentry_sdk
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Envoie un événement de test à Sentry (SENTRY_DSN requis)."

    def handle(self, *args: object, **options: object) -> None:
        client = sentry_sdk.get_client()
        if not client.is_active():
            raise CommandError(
                "Sentry désactivé : SENTRY_DSN n'est pas défini. "
                "Aucun événement envoyé."
            )
        event_id = sentry_sdk.capture_message(
            "sentry_check : événement de test", level="info",
        )
        sentry_sdk.flush(timeout=10)
        self.stdout.write(self.style.SUCCESS(
            f"Événement de test envoyé (id {event_id}, environnement "
            f"{client.options.get('environment')}) : vérifiez-le dans Sentry."
        ))
