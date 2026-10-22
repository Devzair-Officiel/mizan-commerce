"""Tâches Celery pour les abonnements."""

import logging

import stripe
from celery import shared_task
from django.utils import timezone

from .models import Subscription
from .services import expire_trial
from .stripe_client import billing_enabled, get_client
from .stripe_sync import sync_subscription_from_stripe

logger = logging.getLogger(__name__)


@shared_task
def expire_trials() -> dict:
    """Bascule toutes les souscriptions en essai expiré sur le formule Découverte.

    URS-100 — Filet de sécurité quotidien. Le check lazy de `Shop.effective_plan`
    gate déjà côté lecture, mais cette tâche réconcilie la DB pour que les
    queries directes (dashboards admin, exports, BI) voient le bon état.

    Retourne un dict de stats pour faciliter le monitoring.
    """

    now = timezone.now()
    expired = Subscription.objects.filter(
        status=Subscription.STATUS_TRIALING,
        current_period_end__lte=now,
    )
    count = 0
    for sub in expired.iterator():
        expire_trial(sub)
        count += 1
    return {'expired': count, 'ran_at': now.isoformat()}


@shared_task
def reconcile_subscriptions() -> dict:
    """Resynchronise chaque abonnement Stripe : rattrape un webhook perdu.

    Une erreur Stripe sur une boutique est journalisée (identifiant de la
    souscription locale seulement) et n'arrête pas les autres. Sans clé Stripe,
    rien n'est fait.
    """

    now = timezone.now()
    stats = {'synced': 0, 'errors': 0, 'ran_at': now.isoformat()}
    if not billing_enabled():
        return stats
    client = get_client()
    rows = list(
        Subscription.objects.exclude(stripe_subscription_id='')
        .values_list('pk', 'stripe_subscription_id'),
    )
    for pk, stripe_subscription_id in rows:
        try:
            sync_subscription_from_stripe(client, stripe_subscription_id)
        except stripe.StripeError as exc:
            stats['errors'] += 1
            logger.warning(
                'Réconciliation Stripe : échec pour la souscription %s (%s).',
                pk, type(exc).__name__,
            )
            continue
        stats['synced'] += 1
    return stats
