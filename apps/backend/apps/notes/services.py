import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Count, Exists, OuterRef, Q, QuerySet, Sum
from django.utils import timezone
from django.http import QueryDict
from rest_framework.exceptions import ValidationError

from apps.core.permissions import MODULE_REMINDERS
from apps.orders.models import Order
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.permissions import shop_has_feature
from .automatic_texts import money, text
from .models import Reminder, ReminderSettings

logger = logging.getLogger(__name__)

# Onglets de la page Rappels : à faire (en retard + aujourd'hui), à venir, terminés.
REMINDER_SCOPES = ('todo', 'upcoming', 'done')

# Le rappel des commandes en attente est créé le matin (heures locales).
PENDING_ORDERS_MORNING = range(8, 12)


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


# ── Moments, recherche et compteurs de la page Rappels ─────────────────────────

# Groupes de la liste : en retard (avant aujourd'hui), aujourd'hui, demain,
# cette semaine (les sept jours qui commencent aujourd'hui), plus tard.
MOMENTS = ('overdue', 'today', 'tomorrow', 'week', 'later')


def moment_bounds(shop: Shop, now: datetime | None = None) -> list[datetime]:
    """Débuts d'aujourd'hui, de demain, d'après-demain et fin de la semaine, dans le
    fuseau de la boutique : bornes des groupes `MOMENTS`."""
    tomorrow = todo_cutoff(shop, now)
    today = tomorrow - timedelta(days=1)
    return [today, tomorrow, tomorrow + timedelta(days=1), today + timedelta(days=7)]


def moment_of(due_at: datetime, bounds: list[datetime]) -> str:
    for moment, bound in zip(MOMENTS, bounds):
        if due_at < bound:
            return moment
    return MOMENTS[-1]


def search_reminders(qs: QuerySet[Reminder], term: str) -> QuerySet[Reminder]:
    """Chaque mot doit se trouver dans le titre ou le nom du client."""
    for word in term.split():
        qs = qs.filter(
            Q(title__icontains=word)
            | Q(customer__first_name__icontains=word)
            | Q(customer__name__icontains=word)
        )
    return qs


def filter_reminders(
    qs: QuerySet[Reminder], params: QueryDict, member: ShopMember,
) -> QuerySet[Reminder]:
    """Filtres communs à la liste et aux compteurs : `search`, `category`, `for`,
    `customer` et `order` (rappels d'une fiche)."""
    if customer_id := params.get('customer'):
        qs = qs.filter(customer_id=customer_id)
    if order_id := params.get('order'):
        qs = qs.filter(order_id=order_id)
    if category := params.get('category'):
        qs = qs.filter(category=category)
    if for_value := params.get('for'):
        qs = filter_for(qs, for_value, member)
    if term := params.get('search', '').strip():
        qs = search_reminders(qs, term)
    return qs


def reminder_counts(
    qs: QuerySet[Reminder], shop: Shop, now: datetime | None = None,
) -> dict[str, int]:
    """Compteurs des onglets et des groupes, en une requête. `todo` = en retard +
    aujourd'hui (même définition que le badge), `upcoming` = demain et après."""
    today, tomorrow, after_tomorrow, week_end = moment_bounds(shop, now)
    pending = Q(status='pending')
    counts = qs.aggregate(
        overdue=Count('id', filter=pending & Q(due_at__lt=today)),
        todo=Count('id', filter=pending & Q(due_at__lt=tomorrow)),
        upcoming=Count('id', filter=pending & Q(due_at__gte=tomorrow)),
        tomorrow=Count('id', filter=pending & Q(due_at__gte=tomorrow, due_at__lt=after_tomorrow)),  # noqa: E501
        this_week=Count('id', filter=pending & Q(due_at__gte=after_tomorrow, due_at__lt=week_end)),  # noqa: E501
        done=Count('id', filter=Q(status='done')),
    )
    return counts


# ── Assignation ────────────────────────────────────────────────────────────────


def visible_to(member: ShopMember) -> Q:
    """Rappels d'un membre : les siens et ceux de toute l'équipe (badge, accueil,
    filtre « Moi »)."""
    return Q(assigned_to=member) | Q(assigned_to__isnull=True)


def filter_for(qs: QuerySet[Reminder], value: str, member: ShopMember) -> QuerySet[Reminder]:  # noqa: E501
    """Filtre « Pour » : `me` (les miens et ceux de toute l'équipe), `team` (toute
    l'équipe seulement) ou l'identifiant d'un membre."""
    if value == 'me':
        return qs.filter(visible_to(member))
    if value == 'team':
        return qs.filter(assigned_to__isnull=True)
    try:
        member_id = uuid.UUID(value)
    except ValueError:
        raise ValidationError({'for': 'Membre inconnu.'})
    return qs.filter(assigned_to_id=member_id)


def assignable_members(shop: Shop) -> QuerySet[ShopMember]:
    """Membres qui ont accès aux rappels, donc à qui en attribuer un.

    Le propriétaire et les administrateurs, et les employés à qui le module
    `reminders` est accordé (même règle que `ShopMember.has_module`). Sans
    la formule Boutique, employés et administrateurs sont suspendus
    (`is_member_suspended`) : seul le propriétaire reste.
    """
    members = shop.members.select_related('user').order_by('created_at')
    if not shop_has_feature(shop, 'multi_user'):
        return members.filter(role=ShopMember.ROLE_OWNER)
    return members.filter(
        Q(role__in=(ShopMember.ROLE_OWNER, ShopMember.ROLE_ADMIN))
        | Q(permissions__contains=[MODULE_REMINDERS]),
    )


# ── Rappels automatiques (URS-055 à 057) ───────────────────────────────────────


def get_reminder_settings(shop: Shop) -> ReminderSettings:
    """Réglages de la boutique, créés avec les valeurs par défaut à la première lecture."""  # noqa: E501
    reminder_settings, _ = ReminderSettings.objects.get_or_create(shop=shop)
    return reminder_settings


def _owner(shop: Shop) -> ShopMember | None:
    return shop.members.filter(role=ShopMember.ROLE_OWNER).select_related('user').first()  # noqa: E501


def _language(owner: ShopMember | None) -> str:
    return owner.user.language if owner else 'fr'


def create_unpaid_followups(
    shop: Shop, config: ReminderSettings, now: datetime, language: str,
) -> int:
    """Une relance par commande non annulée, avec un client, non soldée depuis
    `unpaid_followup_days` jours, sans relance en attente pour cette commande.
    Une seule fois par commande : terminée ou supprimée, elle n'est pas recréée."""
    if not config.unpaid_followup_enabled:
        return 0
    pending_followup = Reminder.objects.filter(
        order=OuterRef('pk'), status='pending', category='customer_followup',
    )
    already_automatic = Reminder.objects.filter(order=OuterRef('pk'), is_automatic=True)
    orders = (
        Order.objects.filter(
            shop=shop,
            customer__isnull=False,
            payment_status__in=('unpaid', 'partial'),
            created_at__lte=now - timedelta(days=config.unpaid_followup_days),
        )
        .exclude(status='cancelled')
        .exclude(Exists(pending_followup))
        .exclude(Exists(already_automatic))
        .select_related('customer')
    )
    created = 0
    for order in orders:
        _, is_new = Reminder.objects.get_or_create(
            shop=shop,
            auto_key=f'unpaid:{order.pk}',
            defaults={
                'title': text(
                    language, 'unpaid_title', name=order.customer.display_name,
                ),
                'category': 'customer_followup',
                'due_at': now,
                'customer': order.customer,
                'order': order,
                'is_automatic': True,
            },
        )
        created += is_new
    return created


def create_pending_orders_reminder(
    shop: Shop, config: ReminderSettings, now: datetime, language: str,
) -> int:
    """Le matin, un seul rappel du jour s'il reste des commandes à préparer depuis
    plus de `pending_orders_days` jours."""
    local = now.astimezone(ZoneInfo(shop.timezone))
    if not config.pending_orders_enabled or local.hour not in PENDING_ORDERS_MORNING:
        return 0
    days = config.pending_orders_days
    count = Order.objects.filter(
        shop=shop, status='to_prepare', created_at__lte=now - timedelta(days=days),
    ).count()
    if not count:
        return 0
    _, is_new = Reminder.objects.get_or_create(
        shop=shop,
        auto_key=f'pending_orders:{local.date().isoformat()}',
        defaults={
            'title': text(
                language, 'pending_title', count,
                days=text(language, 'days', days),
            ),
            'category': 'order_prep',
            'due_at': now,
            'is_automatic': True,
        },
    )
    return int(is_new)


def build_daily_summary(shop: Shop, owner: ShopMember, now: datetime) -> tuple[str, str]:  # noqa: E501
    """Objet et corps de l'e-mail du résumé du jour, dans la langue du propriétaire :
    commandes à préparer, impayés, rappels du jour (les siens et ceux de l'équipe)."""
    language = owner.user.language
    tz = ZoneInfo(shop.timezone)
    day_start = todo_cutoff(shop, now) - timedelta(days=1)
    to_prepare = Order.objects.filter(shop=shop, status='to_prepare').count()
    unpaid = Order.objects.filter(
        shop=shop, payment_status__in=('unpaid', 'partial'),
    ).exclude(status='cancelled')
    totals = unpaid.aggregate(total=Sum('total_amount'), paid=Sum('amount_paid'))
    due = (totals['total'] or Decimal('0')) - (totals['paid'] or Decimal('0'))
    reminders = list(reminders_to_do(shop, now).filter(visible_to(owner))[:20])

    lines = [
        text(language, 'greeting', name=owner.user.full_name or owner.user.email),
        '',
        text(language, 'intro'),
        '',
        f"- {text(language, 'to_prepare', to_prepare)}",
        f"- {text(language, 'unpaid', unpaid.count(), amount=money(due, shop.currency, language))}",  # noqa: E501
        f"- {text(language, 'reminders', len(reminders))}",
    ]
    for reminder in reminders:
        local_due = reminder.due_at.astimezone(tz)
        when = local_due.strftime('%H:%M')
        if reminder.due_at < day_start:
            when = f"{local_due.strftime('%d/%m %H:%M')}, {text(language, 'overdue')}"
        lines.append(f'    {when}  {reminder.title}')
    lines += [
        '',
        text(language, 'open_app', url=f'{settings.FRONTEND_URL}/reminders'),
        '',
        text(language, 'footer'),
    ]
    return text(language, 'subject', shop=shop.name), '\n'.join(lines)


def send_daily_summary(shop: Shop, config: ReminderSettings, now: datetime) -> int:
    """E-mail du résumé du jour au propriétaire, à l'heure réglée (fuseau de la
    boutique), une fois par jour. Jamais d'envoi WhatsApp automatique.
    Fonction de la formule Boutique : réglage conservé, envoi suspendu en dessous."""
    today = now.astimezone(ZoneInfo(shop.timezone))
    if not config.daily_summary_enabled or today.hour != config.daily_summary_hour:
        return 0
    if not shop_has_feature(shop, 'daily_digest'):
        return 0
    owner = _owner(shop)
    if owner is None:
        return 0
    # Réserve le jour avant d'envoyer : deux tâches simultanées n'envoient qu'un e-mail.
    claimed = ReminderSettings.objects.filter(pk=config.pk).exclude(
        daily_summary_sent_on=today.date(),
    ).update(daily_summary_sent_on=today.date())
    if not claimed:
        return 0
    subject, body = build_daily_summary(shop, owner, now)
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [owner.user.email])
    return 1


def run_automatic_reminders(now: datetime | None = None) -> dict[str, int]:
    """Tâche horaire : rappels automatiques et résumé du jour de chaque boutique."""
    now = now or timezone.now()
    totals = {'unpaid_followups': 0, 'pending_orders': 0, 'daily_summaries': 0}
    for shop in Shop.objects.all().iterator():
        try:
            config = get_reminder_settings(shop)
            if shop_has_feature(shop, 'orders'):
                language = _language(_owner(shop))
                # La relance d'impayé est une fonction de la formule Solo.
                if shop_has_feature(shop, 'auto_reminders'):
                    totals['unpaid_followups'] += create_unpaid_followups(shop, config, now, language)  # noqa: E501
                totals['pending_orders'] += create_pending_orders_reminder(shop, config, now, language)  # noqa: E501
            totals['daily_summaries'] += send_daily_summary(shop, config, now)
        except Exception:
            # Une boutique en erreur n'empêche pas les autres.
            logger.exception('Rappels automatiques en échec pour la boutique %s', shop.pk)  # noqa: E501
    return totals


def delete_reminder(reminder: Reminder) -> None:
    """Supprime un rappel. Un rappel automatique passe en `dismissed` : il disparaît
    de toutes les listes, et sa clé empêche la tâche de le recréer."""
    if reminder.is_automatic and reminder.auto_key:
        reminder.status = 'dismissed'
        reminder.save(update_fields=['status', 'updated_at'])
        return
    reminder.delete()
