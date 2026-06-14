"""Tâches Celery pour les abonnements."""

from celery import shared_task
from django.utils import timezone

from .models import Subscription
from .services import expire_trial


@shared_task
def expire_trials() -> dict:
    """Bascule toutes les souscriptions en essai expiré sur le plan Gratuit.

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
