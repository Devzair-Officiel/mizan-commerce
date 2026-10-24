"""Aligne le catalogue Stripe (produits et prix) sur les formules payantes.

`SubscriptionPlan` reste la source de vérité ; voir `apps/subscriptions/stripe_catalog.py`.
Idempotent : relancer la commande ne recrée aucun prix conforme.

Usage :
    docker compose exec backend python manage.py stripe_sync_plans --dry-run
    docker compose exec backend python manage.py stripe_sync_plans
    # Clé de production (sk_live_ / rk_live_) : --allow-live obligatoire.
"""  # noqa: E501

from decimal import Decimal

import stripe
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.subscriptions.stripe_catalog import PlanSync, sync_catalog
from apps.subscriptions.stripe_client import (
    billing_enabled,
    get_client,
    is_live_mode,
    stripe_error_message,
)


class Command(BaseCommand):
    help = 'Crée ou met à jour les produits et prix Stripe des formules payantes.'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Affiche ce qui serait fait, sans rien écrire chez Stripe ni en base.",
        )
        parser.add_argument(
            '--allow-live', action='store_true',
            help='Obligatoire avec une clé de production (sk_live_ ou rk_live_).',
        )

    def handle(self, *args: object, dry_run: bool, allow_live: bool, **options: object) -> None:  # noqa: E501
        if not billing_enabled():
            raise CommandError('STRIPE_SECRET_KEY absente : facturation Stripe désactivée.')  # noqa: E501
        live = is_live_mode()
        if live and not allow_live:
            raise CommandError(
                'Clé Stripe de production : relancez avec --allow-live pour '
                'modifier le catalogue réel.',
            )
        mode = 'PRODUCTION' if live else 'test'
        suffix = ' — simulation, rien ne sera écrit' if dry_run else ''
        self.stdout.write(f'Mode Stripe : {mode}{suffix}')
        try:
            results = sync_catalog(get_client(), dry_run=dry_run)
        except stripe.StripeError as exc:
            # Message Stripe seul : ni la clé, ni la requête, ni les en-têtes.
            raise CommandError(f'Erreur Stripe : {stripe_error_message(exc)}') from None
        for result in results:
            self._write_plan(result)
        done = 'Simulation terminée.' if dry_run else 'Catalogue Stripe à jour.'
        self.stdout.write(self.style.SUCCESS(done))

    def _write_plan(self, result: PlanSync) -> None:
        self.stdout.write(f'  produit {result.product_id} : {result.product_action}')
        for price in result.prices:
            amount = Decimal(price.amount_cents).scaleb(-2)
            self.stdout.write(
                f'    {price.lookup_key:24} {amount} {price.currency.upper()}'
                f' / {price.interval} : {price.action} {price.price_id}'.rstrip(),
            )
