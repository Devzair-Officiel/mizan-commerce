from __future__ import annotations

from datetime import date, timedelta

from celery import shared_task
from django.utils import timezone


@shared_task
def send_zakat_reminders() -> dict[str, int]:
    """
    Tâche quotidienne : crée un rappel de catégorie 'zakat' pour chaque boutique
    dont la date annuelle de zakat tombe dans exactement 7 jours,
    si aucun rappel de ce type n'existe déjà pour cette date.
    """
    from apps.notes.models import Reminder
    from apps.shops.models import Shop

    target_date = date.today() + timedelta(days=7)
    shops = Shop.objects.filter(zakat_annual_date__month=target_date.month,
                                zakat_annual_date__day=target_date.day)

    created = 0
    for shop in shops:
        due_at = timezone.make_aware(
            timezone.datetime(target_date.year, target_date.month, target_date.day, 9, 0)
        )

        already_exists = Reminder.objects.filter(
            shop=shop,
            category='zakat',
            due_at__date=target_date,
            status='pending',
        ).exists()

        if already_exists:
            continue

        owner = shop.members.filter(role='owner').select_related('user').first()
        Reminder.objects.create(
            shop=shop,
            author=owner.user if owner else None,
            title='Rappel : calcul de la Zakat annuelle',
            description=f"La date annuelle de zakat de votre boutique est dans 7 jours ({target_date.strftime('%d/%m/%Y')}).",
            due_at=due_at,
            category='zakat',
        )
        created += 1

    return {'reminders_created': created}
