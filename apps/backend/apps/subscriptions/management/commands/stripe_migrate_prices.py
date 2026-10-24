"""Passe les abonnés Stripe au prix actuel du catalogue quand ce prix a baissé.

À lancer après `stripe_sync_plans`, qui crée les nouveaux prix ; voir
`apps/subscriptions/stripe_price_migration.py` et
docs/exploitation/deploiement.md (« Changement de prix »). Sans prorata : le
nouveau montant s'applique à la prochaine échéance. Une hausse n'est jamais
appliquée. Les anciens prix restent actifs chez Stripe.

Usage :
    docker compose exec backend python manage.py stripe_migrate_prices --dry-run
    docker compose exec backend python manage.py stripe_migrate_prices
    # Clé de production (sk_live_ / rk_live_) : --allow-live obligatoire.
"""

from collections import Counter

from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.subscriptions.stripe_client import billing_enabled, get_client, is_live_mode
from apps.subscriptions.stripe_price_migration import (
    FAILED,
    IGNORED,
    MIGRATED,
    TO_MIGRATE,
    migrate_prices,
)


class Command(BaseCommand):
    help = "Applique les baisses de prix du catalogue aux abonnements Stripe en cours."

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
                'modifier les abonnements réels.',
            )
        mode = 'PRODUCTION' if live else 'test'
        suffix = ' — simulation, rien ne sera écrit' if dry_run else ''
        self.stdout.write(f'Mode Stripe : {mode}{suffix}')
        results = migrate_prices(get_client(), dry_run=dry_run)
        for result in results:
            self.stdout.write(f'  souscription {result.subscription_id} : {result.outcome} — {result.detail}')  # noqa: E501
        counts = Counter(result.outcome for result in results)
        done = TO_MIGRATE if dry_run else MIGRATED
        total = (
            f'Total : {len(results)} souscription(s) — {counts[done]} {done}, '
            f'{counts[IGNORED]} {IGNORED}, {counts[FAILED]} en erreur.'
        )
        self.stdout.write(self.style.WARNING(total) if counts[FAILED] else self.style.SUCCESS(total))  # noqa: E501
