"""Logique métier d'abonnement.

Toute orchestration non-triviale autour des `Subscription` vit ici (règle CLAUDE.md
sur la séparation views/services/models). Les views ne font que de l'IO HTTP.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Subscription, SubscriptionPlan

TRIAL_DAYS = 14


@transaction.atomic
def start_trial_or_default(shop, user) -> Subscription:
    """Crée la souscription initiale d'une nouvelle boutique.

    URS-100 — Le premier compte d'un utilisateur démarre sur un essai 14 jours
    Boutique+. Toute boutique créée ensuite par le même user démarre directement
    sur le plan Gratuit (le trial est lié au *compte*, pas à la *boutique*).

    Idempotent côté shop : si la boutique a déjà un abonnement, on le retourne.
    Idempotent côté user : si `trial_consumed_at` est déjà posé, pas de nouvel
    essai déclenché.
    """

    existing = Subscription.objects.filter(shop=shop).first()
    if existing is not None:
        return existing

    if user.trial_consumed_at is None:
        plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_BOUTIQUE_PLUS)
        now = timezone.now()
        subscription = Subscription.objects.create(
            shop=shop,
            plan=plan,
            status=Subscription.STATUS_TRIALING,
            current_period_start=now,
            current_period_end=now + timedelta(days=TRIAL_DAYS),
        )
        # Verrouille l'essai pour ce compte : aucune boutique ultérieure ne pourra
        # en redéclencher un. On utilise update_fields pour n'écrire qu'un champ
        # et éviter une race condition sur les autres colonnes du user.
        user.trial_consumed_at = now
        user.save(update_fields=['trial_consumed_at', 'updated_at'])
        return subscription

    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    return Subscription.objects.create(
        shop=shop,
        plan=free_plan,
        status=Subscription.STATUS_ACTIVE,
        current_period_start=timezone.now(),
    )


@transaction.atomic
def downgrade_to_free(subscription: Subscription) -> Subscription:
    """Résilie la souscription courante et bascule la boutique sur Gratuit.

    Utilisé par l'endpoint POST /subscriptions/change/ tant que la facturation
    Stripe n'est pas branchée — c'est le seul changement de plan autorisé via
    API publique.

    Idempotent : un appel sur une souscription déjà sur Gratuit est un no-op.
    """

    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    if subscription.plan_id == free_plan.id and subscription.status == Subscription.STATUS_ACTIVE:
        return subscription

    subscription.plan = free_plan
    subscription.status = Subscription.STATUS_ACTIVE
    subscription.current_period_start = timezone.now()
    subscription.current_period_end = None
    subscription.cancel_at_period_end = False
    subscription.cancelled_at = timezone.now()
    subscription.save(update_fields=[
        'plan', 'status', 'current_period_start', 'current_period_end',
        'cancel_at_period_end', 'cancelled_at', 'updated_at',
    ])
    return subscription


def expire_trial(subscription: Subscription) -> Subscription:
    """Bascule un abonnement en essai expiré sur le plan Gratuit.

    Utilisé par la tâche Celery `expire_trials` (run quotidien) et par les
    callsites lazy qui détectent un trial dont la date est dépassée.

    Idempotent : un appel sur une souscription déjà non-trialing est un no-op.
    """

    if subscription.status != Subscription.STATUS_TRIALING:
        return subscription

    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    subscription.plan = free_plan
    subscription.status = Subscription.STATUS_ACTIVE
    subscription.current_period_start = timezone.now()
    subscription.current_period_end = None
    subscription.save(update_fields=[
        'plan', 'status', 'current_period_start', 'current_period_end', 'updated_at',
    ])
    return subscription
