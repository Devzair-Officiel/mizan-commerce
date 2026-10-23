"""Messages de facturation au propriétaire : fin d'essai, retard de paiement.

Retard de paiement (règle des 15 jours, `PAST_DUE_GRACE_DAYS`) : rappels à J0,
J+7 et J+13 (`past_due_notices_sent` retient le dernier envoyé), puis
résiliation à partir de J+15, retentée à chaque passage tant que Stripe confirme
le retard, sans dépendre du compteur. `past_due_cancel_requested_at` date la
première tentative ; il survit à la résiliation (`stripe_sync` remet le compteur
à 0) et garde le message de fin à envoyer, une seule fois, quand le retour sur
Découverte est constaté. Le retour du paiement efface tout (`stripe_sync`).

Chaque envoi est d'abord réservé par un update conditionnel : seul l'appel qui a
modifié la ligne envoie, deux exécutions simultanées ne doublent rien. Un envoi
en échec annule sa réservation (update conditionnel inverse) et la prochaine
exécution réessaie. Journaux : identifiant local de la souscription seulement,
avec le type et le code d'une erreur Stripe.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

import stripe
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import QuerySet

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.shops.models import ShopMember

from . import billing_notice_texts as texts
from .limits import shop_usage
from .models import Subscription, SubscriptionPlan
from .services import PAST_DUE_GRACE_DAYS
from .stripe_client import billing_enabled, get_client
from .stripe_sync import STRIPE_CANCELED, sync_subscription_from_stripe

logger = logging.getLogger(__name__)

STAGE_NONE = 0
STAGE_FIRST = 1
STAGE_WEEK = 2
STAGE_LAST = 3
STAGE_ENDED = 4
# Du plus tardif au plus tôt : l'étape due est la première atteinte.
STAGE_THRESHOLDS: tuple[tuple[int, int], ...] = (
    (STAGE_ENDED, PAST_DUE_GRACE_DAYS),
    (STAGE_LAST, 13),
    (STAGE_WEEK, 7),
    (STAGE_FIRST, 0),
)
# Au-delà, depuis la première tentative, l'échec de résiliation passe en erreur.
CANCEL_ALERT_DELAY = timedelta(hours=24)
STRIPE_PAST_DUE_STATUSES = frozenset({'past_due', 'unpaid'})
TRIAL_NOTICE_WINDOW = timedelta(hours=24)
# Compteurs de `shop_usage` → limite de la formule Découverte.
FREE_LIMIT_FIELDS: tuple[tuple[str, str], ...] = (
    ('products', 'max_products'),
    ('orders_this_month', 'max_orders_per_month'),
    ('customers', 'max_customers'),
    ('members', 'max_members'),
)

SENT = 'sent'
CANCELLED = 'cancelled'
SKIPPED = 'skipped'
FAILED = 'failed'


def next_past_due_stage(
    past_due_since: datetime | None, now: datetime, notices_sent: int,
) -> int | None:
    """Étape due du retard de paiement, ou `None` s'il n'y a rien à faire.

    Seule l'étape la plus avancée atteinte compte : un rappel dépassé n'est
    jamais envoyé (à J+15 et au-delà, seule la résiliation reste).
    """
    if past_due_since is None:
        return None
    elapsed = now - past_due_since
    for stage, days in STAGE_THRESHOLDS:
        if elapsed >= timedelta(days=days):
            return stage if stage > notices_sent else None
    return None


def past_due_subscriptions() -> QuerySet[Subscription]:
    return Subscription.objects.filter(
        status=Subscription.STATUS_PAST_DUE, past_due_since__isnull=False,
    ).select_related('shop', 'plan')


def process_past_due(subscription: Subscription, now: datetime) -> str:
    """Fait l'étape due d'un abonnement en retard : un rappel ou la résiliation."""
    since = subscription.past_due_since
    if now - since >= timedelta(days=PAST_DUE_GRACE_DAYS):
        return _end_past_due(subscription, since, now)
    current = subscription.past_due_notices_sent
    stage = next_past_due_stage(since, now, current)
    if stage is None:
        return SKIPPED
    owner = owner_of(subscription)
    if owner is None or not _claim(subscription.pk, since, current, stage):
        return SKIPPED
    subject, body = texts.past_due_email(
        owner, subscription.shop, stage, subscription.plan.name,
        since + timedelta(days=PAST_DUE_GRACE_DAYS), now,
    )
    if _send(owner, subject, body, subscription.pk):
        return SENT
    _release(subscription.pk, since, stage, current)
    return FAILED


def _claim(pk: Any, since: datetime, current: int, stage: int) -> bool:
    """Réserve l'étape ; le retard doit être celui lu (même `past_due_since`)."""
    return bool(
        Subscription.objects.filter(
            pk=pk, past_due_notices_sent=current, past_due_since=since,
        ).update(past_due_notices_sent=stage),
    )


def _release(pk: Any, since: datetime, stage: int, previous: int) -> None:
    Subscription.objects.filter(
        pk=pk, past_due_notices_sent=stage, past_due_since=since,
    ).update(past_due_notices_sent=previous)


def _end_past_due(subscription: Subscription, since: datetime, now: datetime) -> str:
    """Résiliation à partir de J+15, retentée à chaque passage tant qu'elle n'a pas abouti.

    Sans clé Stripe (ou sans abonnement Stripe), rien n'est fait. Le message de
    fin part à part (`send_past_due_end_notice`), une fois la résiliation constatée.
    """  # noqa: E501
    if not billing_enabled() or not subscription.stripe_subscription_id:
        return SKIPPED
    if not _mark_cancel_requested(subscription, since, now):
        return SKIPPED
    try:
        return _cancel_if_still_past_due(subscription, since)
    except stripe.StripeError as exc:
        _log_cancel_failure(subscription, now, exc)
        return FAILED


def _mark_cancel_requested(
    subscription: Subscription, since: datetime, now: datetime,
) -> bool:
    """Date la première tentative ; `False` si le retard lu n'est plus celui en base.

    Les tentatives suivantes gardent la date : elles réutilisent la même clé
    d'idempotence, une résiliation en double est donc sans effet chez Stripe.
    """
    if subscription.past_due_cancel_requested_at is not None:
        return True
    marked = Subscription.objects.filter(
        pk=subscription.pk, status=Subscription.STATUS_PAST_DUE,
        past_due_since=since, past_due_cancel_requested_at__isnull=True,
    ).update(past_due_cancel_requested_at=now)
    if marked:
        subscription.past_due_cancel_requested_at = now
    return bool(marked)


def _cancel_if_still_past_due(subscription: Subscription, since: datetime) -> str:
    """Resynchronise, résilie sur-le-champ si toujours en retard, resynchronise.

    Ni facture finale ni prorata (`invoice_now`, `prorate` à False). Déjà résilié
    chez Stripe (passage précédent interrompu) : seule la facture reste à annuler.
    La seconde synchronisation applique le retour sur Découverte (`stripe_sync`) ;
    si elle échoue, le webhook ou la réconciliation le fera.
    """
    client = get_client()
    stripe_subscription_id = subscription.stripe_subscription_id
    remote = sync_subscription_from_stripe(client, stripe_subscription_id)
    if remote.status == STRIPE_CANCELED:
        _void_open_invoice(client, subscription.pk, stripe_subscription_id)
        return CANCELLED
    if remote.status not in STRIPE_PAST_DUE_STATUSES:
        return SKIPPED
    key = f'mizan-pastdue-cancel-{subscription.pk}-{int(since.timestamp())}'
    client.v1.subscriptions.cancel(
        stripe_subscription_id,
        params={'invoice_now': False, 'prorate': False},
        options={'idempotency_key': key},
    )
    _void_open_invoice(client, subscription.pk, stripe_subscription_id)
    try:
        sync_subscription_from_stripe(client, stripe_subscription_id)
    except stripe.StripeError as exc:
        logger.warning(
            'Résiliation pour retard : resynchronisation à refaire pour la '
            'souscription %s (%s).', subscription.pk, type(exc).__name__,
        )
    return CANCELLED


def _log_cancel_failure(
    subscription: Subscription, now: datetime, exc: stripe.StripeError,
) -> None:
    """Avertissement, puis erreur après 24 h de tentatives sans résiliation."""
    first_attempt = subscription.past_due_cancel_requested_at or now
    level = logging.ERROR if now - first_attempt > CANCEL_ALERT_DELAY else logging.WARNING  # noqa: E501
    logger.log(
        level,
        'Résiliation pour retard : échec Stripe pour la souscription %s (%s, code %s).',  # noqa: E501
        subscription.pk, type(exc).__name__, exc.code or '-',
    )


def _void_open_invoice(
    client: stripe.StripeClient, pk: Any, stripe_subscription_id: str,
) -> None:
    """Annule la dernière facture ouverte de cet abonnement, plus payable ensuite.

    Seul le statut `open` est demandé : une facture payée ou déjà annulée n'est
    pas listée. Un échec est journalisé et ne remet pas la résiliation en cause.
    """
    try:
        invoices = client.v1.invoices.list(
            params={'subscription': stripe_subscription_id, 'status': 'open', 'limit': 1},  # noqa: E501
        )
        for invoice in invoices.data:
            client.v1.invoices.void_invoice(
                invoice.id, options={'idempotency_key': f'mizan-pastdue-void-{invoice.id}'},  # noqa: E501
            )
    except Exception as exc:
        logger.warning(
            'Résiliation pour retard : facture ouverte non annulée pour la '
            'souscription %s (%s, code %s).',
            pk, type(exc).__name__, getattr(exc, 'code', None) or '-',
        )


def past_due_ended_subscriptions() -> QuerySet[Subscription]:
    """Résiliations pour retard constatées (retour sur Découverte), non prévenues."""
    return Subscription.objects.filter(
        past_due_cancel_requested_at__isnull=False,
        stripe_subscription_id='',
        plan__code=SubscriptionPlan.CODE_FREE,
    )


def send_past_due_end_notice(subscription: Subscription, now: datetime) -> str:
    """Message de fin, une seule fois : la réservation efface la marque.

    Ne dépend pas de `past_due_notices_sent`, remis à 0 par la résiliation. Sans
    propriétaire à prévenir, la marque est effacée quand même (rien à réessayer).
    """
    requested_at = subscription.past_due_cancel_requested_at
    claimed = past_due_ended_subscriptions().filter(
        pk=subscription.pk, past_due_cancel_requested_at=requested_at,
    ).update(past_due_cancel_requested_at=None)
    owner = owner_of(subscription) if claimed else None
    if owner is None:
        return SKIPPED
    subject, body = texts.subscription_ended_email(
        owner, subscription.shop, _ended_plan_name(subscription),
        subscription.cancelled_at or now,
    )
    if _send(owner, subject, body, subscription.pk):
        return SENT
    Subscription.objects.filter(
        pk=subscription.pk, past_due_cancel_requested_at__isnull=True,
        stripe_subscription_id='',
    ).update(past_due_cancel_requested_at=requested_at)
    return FAILED


def _ended_plan_name(subscription: Subscription) -> str:
    """Formule résiliée, lue au journal `subscription_ended` (`stripe_sync`)."""
    changes = (
        AuditLog.objects.filter(
            shop_id=subscription.shop_id, action='subscription_ended',
            model_name='Subscription', object_id=str(subscription.pk),
        )
        .values_list('changes', flat=True)
        .first()
    )
    code = (changes or {}).get('from', '')
    plan = SubscriptionPlan.objects.filter(code=code).first() if code else None
    return plan.name if plan is not None else ''


def trial_ending_subscriptions(now: datetime) -> QuerySet[Subscription]:
    """Essais Mizan (sans abonnement Stripe) finissant dans les 24 h, non prévenus."""
    return Subscription.objects.filter(
        status=Subscription.STATUS_TRIALING,
        stripe_subscription_id='',
        current_period_end__gt=now,
        current_period_end__lte=now + TRIAL_NOTICE_WINDOW,
        trial_ending_notice_sent_at__isnull=True,
    )


def send_trial_ending_notice(subscription: Subscription, now: datetime) -> str:
    """Rappel 24 h avant la fin de l'essai, une seule fois par essai."""
    owner = owner_of(subscription)
    if owner is None:
        return SKIPPED
    # La réservation reprend toutes les conditions de la cible : rien n'est relu.
    claimed = trial_ending_subscriptions(now).filter(pk=subscription.pk).update(
        trial_ending_notice_sent_at=now,
    )
    if not claimed:
        return SKIPPED
    limits, reached = _free_plan_limits(subscription.shop)
    subject, body = texts.trial_ending_email(
        owner, subscription.shop, subscription.current_period_end, limits, reached,
    )
    if _send(owner, subject, body, subscription.pk):
        return SENT
    Subscription.objects.filter(
        pk=subscription.pk, trial_ending_notice_sent_at=now,
    ).update(trial_ending_notice_sent_at=None)
    return FAILED


def _free_plan_limits(
    shop: Any,
) -> tuple[list[tuple[str, int]], list[tuple[str, int, int]]]:
    """Limites de Découverte (illimitées omises) et celles que l'usage atteint."""
    free_plan = SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
    usage = shop_usage(shop)
    limits: list[tuple[str, int]] = []
    reached: list[tuple[str, int, int]] = []
    for key, field in FREE_LIMIT_FIELDS:
        limit = getattr(free_plan, field)
        if limit is None:
            continue
        limits.append((key, limit))
        count = usage[key]['count']
        if count >= limit:
            reached.append((key, count, limit))
    return limits, reached


def owner_of(subscription: Subscription) -> User | None:
    """Propriétaire de la boutique, seul destinataire ; `None` sans adresse."""
    member = (
        ShopMember.objects.filter(shop_id=subscription.shop_id, role=ShopMember.ROLE_OWNER)  # noqa: E501
        .select_related('user')
        .first()
    )
    if member is None or not member.user.email:
        logger.warning('Souscription %s : aucun propriétaire à prévenir.', subscription.pk)  # noqa: E501
        return None
    return member.user


def _send(user: User, subject: str, body: str, pk: Any) -> bool:
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email])
    except Exception as exc:
        logger.warning(
            'Message de facturation non envoyé pour la souscription %s (%s).',
            pk, type(exc).__name__,
        )
        return False
    return True
