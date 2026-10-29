"""Logique métier d'abonnement.

Toute orchestration non-triviale autour des `Subscription` vit ici (règle CLAUDE.md
sur la séparation views/services/models). Les views ne font que de l'IO HTTP.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.core.audit import log_action

from .models import Subscription, SubscriptionPlan

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.shops.models import Shop

TRIAL_DAYS = 14
# Délai laissé à un paiement en retard avant le retour sur Découverte (lot 4).
PAST_DUE_GRACE_DAYS = 15
# Attribution manuelle (admin Mizan) : un retard de paiement ou une suspension
# se règle d'abord, et un abonnement Stripe se change dans Stripe.
ASSIGNABLE_STATUSES = (
    Subscription.STATUS_TRIALING,
    Subscription.STATUS_ACTIVE,
    Subscription.STATUS_CANCELLED,
)
STRIPE_MANAGED_MESSAGE = (
    'Abonnement géré par Stripe : changez la formule dans Stripe (tableau de bord '
    "ou portail du commerçant), pas dans l'admin."
)


@transaction.atomic
def start_trial_or_default(shop, user) -> Subscription:
    """Crée la souscription initiale d'une nouvelle boutique.

    URS-100 — Le premier compte d'un utilisateur démarre sur un essai 14 jours
    Boutique. Toute boutique créée ensuite par le même user démarre directement
    sur le formule Découverte (le trial est lié au *compte*, pas à la *boutique*).

    Idempotent côté shop : si la boutique a déjà un abonnement, on le retourne.
    Idempotent côté user : si `trial_consumed_at` est déjà posé, pas de nouvel
    essai déclenché.
    """

    existing = Subscription.objects.filter(shop=shop).first()
    if existing is not None:
        return existing

    if user.trial_consumed_at is None:
        plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_BOUTIQUE)
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
    """Résilie la souscription courante et bascule la boutique sur Découverte.

    Utilisé par l'endpoint POST /subscriptions/change/ tant que la facturation
    Stripe n'est pas branchée — c'est le seul changement de plan autorisé via
    API publique.

    Idempotent : un appel sur une souscription déjà sur Découverte est un no-op.
    """

    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    if subscription.plan_id == free_plan.id and subscription.status == Subscription.STATUS_ACTIVE:  # noqa: E501
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
    """Bascule un abonnement en essai expiré sur le formule Découverte.

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


class PlanAssignmentError(Exception):
    """Attribution manuelle refusée ; le message s'affiche tel quel dans l'admin."""


@transaction.atomic
def set_plan_manually(
    subscription: Subscription,
    plan: str,
    *,
    until: date | None = None,
    reason: str,
    actor: User,
) -> Subscription:
    """Attribue une formule depuis l'admin Mizan, avec ou sans date de fin.

    Réservé aux abonnements sans lien Stripe (Stripe fait foi pour les autres).
    `until` est un jour compris : la formule court jusqu'à la fin de cette journée
    dans le fuseau de la boutique, puis `expire_trials` ramène la boutique sur
    Découverte. La garde est dans l'UPDATE (lien Stripe, statut) : une liaison
    Stripe ou un retard de paiement survenus depuis la lecture font échouer
    l'attribution, sans rien écrire.
    """
    reason = reason.strip()
    if not reason:
        raise PlanAssignmentError('Motif obligatoire.')
    if subscription.stripe_subscription_id:
        raise PlanAssignmentError(STRIPE_MANAGED_MESSAGE)
    new_plan = SubscriptionPlan.objects.filter(code=plan, is_active=True).first()
    if new_plan is None:
        raise PlanAssignmentError('Formule inconnue ou désactivée.')
    period_end = _assignment_end(subscription.shop, new_plan, until)
    # Ligne verrouillée : l'ancienne formule notée au journal est celle remplacée.
    rows = Subscription.objects.filter(pk=subscription.pk)
    locked = rows.select_for_update(of=('self',))
    previous = locked.values_list('plan__code', flat=True).get()
    now = timezone.now()
    updated = rows.filter(
        stripe_subscription_id='', status__in=ASSIGNABLE_STATUSES,
    ).update(
        plan=new_plan, status=Subscription.STATUS_ACTIVE, current_period_start=now,
        current_period_end=period_end, cancel_at_period_end=False, cancelled_at=None,
        updated_at=now,
    )
    if not updated:
        raise PlanAssignmentError(
            'Abonnement modifié entre-temps (lié à Stripe, en retard de paiement ou '
            "suspendu) : rien n'a été changé. Rechargez la page.",
        )
    log_action(
        shop_id=str(subscription.shop_id), user=actor,
        action='subscription_plan_assigned', model_name='Subscription',
        obj_id=subscription.pk,
        obj_repr=f'Abonnement {new_plan.name}',
        changes={
            'from': previous, 'to': new_plan.code,
            'until': until.isoformat() if until else None,
            'reason': reason, 'actor_id': str(actor.pk),
        },
    )
    subscription.refresh_from_db()
    return subscription


def _assignment_end(
    shop: Shop, plan: SubscriptionPlan, until: date | None,
) -> datetime | None:
    """Fin de la journée `until` dans le fuseau de la boutique ; None sans date."""
    if until is None:
        return None
    if plan.code == SubscriptionPlan.CODE_FREE:
        raise PlanAssignmentError('Découverte est sans fin : laissez la date vide.')
    zone = ZoneInfo(shop.timezone)
    if until < timezone.localdate(timezone=zone):
        raise PlanAssignmentError('Date de fin passée.')
    return datetime.combine(until, time.max, tzinfo=zone)


def expired_assignments(now: datetime) -> QuerySet[Subscription]:
    """Formules payantes attribuées dont la date de fin est passée.

    Abonnement actif sans lien Stripe : `current_period_end` y est la fin de la
    formule attribuée (`set_plan_manually`), comme `Subscription.assignment_ends_at`.
    """
    return Subscription.objects.filter(
        status=Subscription.STATUS_ACTIVE, stripe_subscription_id='',
        current_period_end__lte=now,
    ).exclude(plan__code=SubscriptionPlan.CODE_FREE)


def end_plan_assignment(subscription: Subscription, now: datetime) -> bool:
    """Ramène sur Découverte une formule attribuée échue ; tracé sans auteur.

    Garde dans l'UPDATE (conditions de `expired_assignments`) : une nouvelle
    attribution ou une liaison Stripe survenue entre-temps l'emporte.
    Retourne False si rien n'a été changé.
    """
    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    ended_at = subscription.current_period_end
    updated = expired_assignments(now).filter(
        pk=subscription.pk, current_period_end=ended_at,
    ).update(
        plan=free_plan, current_period_start=now, current_period_end=None,
        updated_at=now,
    )
    if not updated:
        return False
    log_action(
        shop_id=str(subscription.shop_id), user=None,
        action='subscription_assignment_ended', model_name='Subscription',
        obj_id=subscription.pk, obj_repr=f'Abonnement {free_plan.name}',
        changes={
            'from': subscription.plan.code, 'to': free_plan.code,
            'ended_at': ended_at.isoformat() if ended_at else None,
        },
    )
    return True
