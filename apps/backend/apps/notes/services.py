from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import QuerySet
from django.utils import timezone

from apps.shops.models import Shop
from .models import Reminder

# Onglets de la page Rappels : à faire (en retard + aujourd'hui), à venir, terminés.
REMINDER_SCOPES = ('todo', 'upcoming', 'done')


def todo_cutoff(shop: Shop, now: datetime | None = None) -> datetime:
    """Minuit qui termine la journée en cours, dans le fuseau de la boutique."""
    local = (now or timezone.now()).astimezone(ZoneInfo(shop.timezone))
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight + timedelta(days=1)


def pending_reminders(shop: Shop) -> QuerySet[Reminder]:
    return Reminder.objects.filter(shop=shop, status='pending')


def reminders_to_do(shop: Shop, now: datetime | None = None) -> QuerySet[Reminder]:
    """Rappels « à faire » : en attente, échus ou prévus aujourd'hui (fuseau de la
    boutique). Seule définition, lue par le badge, l'accueil et la page Rappels."""
    return pending_reminders(shop).filter(due_at__lt=todo_cutoff(shop, now))


def reminders_in_scope(
    shop: Shop, scope: str | None, now: datetime | None = None,
) -> QuerySet[Reminder]:
    """Rappels d'un onglet ; sans onglet, tous ceux en attente."""
    if scope == 'todo':
        return reminders_to_do(shop, now)
    if scope == 'upcoming':
        return pending_reminders(shop).filter(due_at__gte=todo_cutoff(shop, now))
    if scope == 'done':
        return Reminder.objects.filter(shop=shop, status='done')
    return pending_reminders(shop)
