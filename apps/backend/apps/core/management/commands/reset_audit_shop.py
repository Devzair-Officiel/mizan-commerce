"""
Remet les boutiques des audits Playwright dans leur état de départ.

Supprime les boutiques dont un compte d'audit (e2e@example.com, e2e2@…) est
propriétaire (cascade), puis recrée une boutique par emplacement (`--slots`,
audits lancés en parallèle) comme seed_data. Aucune autre boutique n'est touchée.
Lancée automatiquement avant `docker compose run --rm e2e` (service e2e-reset).

Usage :
    docker compose exec backend python manage.py reset_audit_shop [--slots 3]
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from apps.shops.models import Shop

from ._seed_e2e import AUDIT_EMAIL_RE, seed_audit_shop

# Audits lancés en même temps par défaut (AUDIT_JOBS de run-audits.mjs).
DEFAULT_SLOTS = 3


class Command(BaseCommand):
    help = "Supprime puis recrée les boutiques des audits (e2e@example.com, e2e2@…)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--slots", type=int, default=DEFAULT_SLOTS,
            help="Nombre de boutiques d'audit (une par audit lancé en parallèle).",
        )

    @transaction.atomic
    def handle(self, *args: object, **options: object) -> None:
        if not settings.DEBUG and os.environ.get("ALLOW_SEED") != "1":
            raise CommandError(
                "reset_audit_shop ne s'exécute qu'en environnement DEBUG. "
                "Définir ALLOW_SEED=1 pour forcer."
            )

        slots = options["slots"]
        if not isinstance(slots, int) or slots < 1:
            raise CommandError("--slots : au moins 1.")

        shops = Shop.objects.filter(
            members__user__email__regex=AUDIT_EMAIL_RE, members__role="owner"
        )
        count = shops.count()
        shops.delete()  # CASCADE supprime toutes les données liées
        self.stdout.write(self.style.WARNING(f"  {count} boutique(s) d'audit supprimée(s)."))  # noqa: E501
        for slot in range(1, slots + 1):
            shop = seed_audit_shop(slot=slot, stdout=self.stdout)
            self.stdout.write(self.style.SUCCESS(f"Boutique d'audit recréée : {shop.name}"))  # noqa: E501
