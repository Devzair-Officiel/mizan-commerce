"""
Remet la boutique des audits Playwright (e2e@example.com) dans son état de départ.

Supprime les boutiques dont ce compte est propriétaire (cascade), puis les
recrée comme seed_data. Aucune autre boutique n'est touchée.
Lancée automatiquement avant `docker compose run --rm e2e` (service e2e-reset).

Usage :
    docker compose exec backend python manage.py reset_audit_shop
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.shops.models import Shop

from ._seed_e2e import AUDIT_EMAIL, seed_audit_shop


class Command(BaseCommand):
    help = "Supprime puis recrée la boutique des audits (e2e@example.com)."

    @transaction.atomic
    def handle(self, *args: object, **options: object) -> None:
        if not settings.DEBUG and os.environ.get("ALLOW_SEED") != "1":
            raise CommandError(
                "reset_audit_shop ne s'exécute qu'en environnement DEBUG. "
                "Définir ALLOW_SEED=1 pour forcer."
            )

        shops = Shop.objects.filter(
            members__user__email=AUDIT_EMAIL, members__role="owner"
        )
        count = shops.count()
        shops.delete()  # CASCADE supprime toutes les données liées
        self.stdout.write(self.style.WARNING(f"  {count} boutique(s) d'audit supprimée(s)."))  # noqa: E501
        shop = seed_audit_shop(stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS(f"Boutique d'audit recréée : {shop.name}"))  # noqa: E501
