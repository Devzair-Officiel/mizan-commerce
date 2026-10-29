"""Tâches Celery pour les abonnements."""

import logging

import stripe
from celery import shared_task
from django.utils import timezone

from . import billing_notices
from .models import Subscription
from .services import end_plan_assignment, expire_trial, expired_assignments
from .stripe_client import billing_enabled, get_client
from .stripe_sync import sync_subscription_from_stripe

logger = logging.getLogger(__name__)


@shared_task
def expire_trials() -> dict:
    """Bascule sur Découverte les essais expirés et les formules attribuées échues.

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
    # Abonnement actif sans lien Stripe : `current_period_end` y est la fin d'une
    # formule attribuée par l'admin Mizan. Échue, retour silencieux sur
    # Découverte (aucun message au commerçant), tracé dans AuditLog.
    ended = sum(
        end_plan_assignment(sub, now)
        for sub in expired_assignments(now).select_related('plan').iterator()
    )
    return {'expired': count, 'assignments_ended': ended, 'ran_at': now.isoformat()}


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


@shared_task
def send_trial_ending_notices() -> dict:
    """Rappel au propriétaire 24 h avant la fin de l'essai (toutes les 15 minutes).

    Un échec sur une boutique est journalisé et n'arrête pas les autres ; sans clé
    Stripe, les rappels partent quand même (l'essai ne dépend pas de Stripe).
    """

    now = timezone.now()
    stats = {'sent': 0, 'failed': 0, 'ran_at': now.isoformat()}
    for subscription in billing_notices.trial_ending_subscriptions(now).select_related('shop'):  # noqa: E501
        try:
            outcome = billing_notices.send_trial_ending_notice(subscription, now)
        except Exception:
            outcome = billing_notices.FAILED
            logger.exception("Rappel de fin d'essai en échec pour la souscription %s.", subscription.pk)  # noqa: E501
        _count(stats, outcome)
    return stats


@shared_task
def process_past_due_subscriptions() -> dict:
    """Retard de paiement (toutes les 15 minutes) : rappels J0, J+7, J+13, résiliation à J+15.

    La résiliation est retentée à chaque passage tant qu'elle n'a pas abouti ; le
    message de fin part ensuite, une fois la résiliation constatée (`sent`). Une
    erreur sur un abonnement n'arrête pas les autres. Sans clé Stripe, la
    résiliation n'est pas tentée ; les rappels partent quand même.
    """  # noqa: E501

    now = timezone.now()
    stats = {'sent': 0, 'cancelled': 0, 'failed': 0, 'ran_at': now.isoformat()}
    for subscription in billing_notices.past_due_subscriptions():
        try:
            outcome = billing_notices.process_past_due(subscription, now)
        except Exception:
            outcome = billing_notices.FAILED
            logger.exception('Retard de paiement en échec pour la souscription %s.', subscription.pk)  # noqa: E501
        _count(stats, outcome)
    for subscription in billing_notices.past_due_ended_subscriptions().select_related('shop'):  # noqa: E501
        try:
            outcome = billing_notices.send_past_due_end_notice(subscription, now)
        except Exception:
            outcome = billing_notices.FAILED
            logger.exception("Message de fin d'abonnement en échec pour la souscription %s.", subscription.pk)  # noqa: E501
        _count(stats, outcome)
    return stats


def _count(stats: dict, outcome: str) -> None:
    if outcome in stats:
        stats[outcome] += 1
