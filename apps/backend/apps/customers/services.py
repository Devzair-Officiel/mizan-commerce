from __future__ import annotations

import csv
import heapq
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Iterable, TypedDict
from zoneinfo import ZoneInfo

import phonenumbers
from babel.numbers import get_decimal_symbol
from django.db.models import (
    CharField, Count, DecimalField, Exists, F, Max, OuterRef, Q, QuerySet, Subquery,
    Sum, Value,
)
from django.db.models.functions import Cast, Coalesce, NullIf
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.core.pagination import TimelineSource
from apps.core.spreadsheet import spreadsheet_safe
from apps.notes.models import Note
from apps.orders.models import Order
from apps.orders.services import current_month_bounds
from apps.shops.models import Shop

from .export_texts import EXPORT_COLUMNS, EXPORT_TEXTS
from .models import Customer


# Champs de recherche de la liste, partagés avec les facettes. `SearchFilter` exige
# que chaque mot se trouve dans l'un d'eux : « Karima Bens » trouve Karima Bensouda.
CUSTOMER_SEARCH_FIELDS = ('first_name', 'name', 'phone', 'email', 'city')
SITUATIONS = ('all', 'active', 'pending', 'deactivated')

_MONEY = DecimalField(max_digits=12, decimal_places=2)
_NOT_CANCELLED = ~Q(orders__status='cancelled')


def name_search(query: str, prefix: str = '') -> Q:
    """Chaque mot de `query` dans le prénom ou le nom du client.

    « Karima », « Bensouda » et « Karima Bens » trouvent Karima Bensouda. `prefix`
    suit une relation (`'customer__'` depuis une commande).
    """
    condition = Q()
    for word in query.split():
        condition &= (
            Q(**{f'{prefix}first_name__icontains': word})
            | Q(**{f'{prefix}name__icontains': word})
        )
    return condition


class InvalidPhoneNumber(ValueError):
    """Numéro qui ne correspond à aucun numéro attribuable."""


def normalize_phone(raw: str, default_region: str = '') -> str:
    """Numéro au format E.164 (`+33612345678`), vide si la saisie est vide.

    Un numéro national (`06 12 34 56 78`) prend l'indicatif de `default_region`
    (le pays de la boutique) ; un numéro qui commence par `+` ou `00` garde le sien.
    Lève `InvalidPhoneNumber` si le numéro n'est pas valide.
    """
    value = raw.strip()
    if not value:
        return ''
    try:
        number = phonenumbers.parse(value, default_region.upper() or None)
    except phonenumbers.NumberParseException as exc:
        raise InvalidPhoneNumber(value) from exc
    if not phonenumbers.is_valid_number(number):
        raise InvalidPhoneNumber(value)
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


def format_phone_display(value: str) -> str:
    """Forme lisible d'un numéro E.164 (`+33 6 12 34 56 78`).

    Un numéro resté hors format (ancienne saisie impossible à normaliser) est
    renvoyé tel quel.
    """
    if not value.startswith('+'):
        return value
    try:
        number = phonenumbers.parse(value, None)
    except phonenumbers.NumberParseException:
        return value
    return phonenumbers.format_number(
        number, phonenumbers.PhoneNumberFormat.INTERNATIONAL,
    )


def customers_with_stats(shop) -> QuerySet[Customer]:
    """Clients de la boutique annotés de leurs chiffres (commandes annulées exclues).

    `has_orders` sert au tri : les clients sans commande restent en fin de liste.
    """
    return Customer.objects.filter(shop=shop).annotate(
        order_count=Count('orders', filter=_NOT_CANCELLED, distinct=True),
        pending_amount=Coalesce(
            Sum(
                F('orders__total_amount') - F('orders__amount_paid'),
                filter=(
                    Q(orders__payment_status__in=['unpaid', 'partial'])
                    & _NOT_CANCELLED
                ),
                output_field=_MONEY,
            ),
            Value(Decimal('0.00')),
            output_field=_MONEY,
        ),
        paid_amount=Coalesce(
            Sum('orders__amount_paid', filter=_NOT_CANCELLED, output_field=_MONEY),
            Value(Decimal('0.00')),
            output_field=_MONEY,
        ),
        last_order_at=Max('orders__created_at', filter=_NOT_CANCELLED),
        has_orders=Exists(
            Order.objects.filter(customer=OuterRef('pk')).exclude(status='cancelled'),
        ),
    )


def filter_customers(
    qs: QuerySet[Customer], shop, params: Mapping[str, str], *, skip: str | None = None,
) -> QuerySet[Customer]:
    """Filtres de la liste Clients, hors recherche (portée par `SearchFilter`).

    Sans `situation`, seuls les clients actifs sont renvoyés (sélecteur de client
    de la commande). `skip='situation'` ignore ce filtre : c'est ce que comptent
    les facettes.
    """
    if skip != 'situation':
        situation = params.get('situation') or 'active'
        if situation == 'active' or situation not in SITUATIONS:
            qs = qs.filter(is_active=True)
        elif situation == 'pending':
            qs = qs.filter(pending_amount__gt=0)
        elif situation == 'deactivated':
            qs = qs.filter(is_active=False)
    if params.get('period') == 'month':
        start, end = current_month_bounds(shop)
        qs = qs.filter(created_at__gte=start, created_at__lt=end)
    return qs


def build_customer_facets(
    shop, qs: QuerySet[Customer], params: Mapping[str, str],
) -> dict:
    """Nombre de clients par situation, avec tous les autres filtres de la liste.

    `qs` doit déjà être annoté (`customers_with_stats`) et limité à la recherche.
    """
    base = filter_customers(qs, shop, params, skip='situation')
    total = base.count()
    active = base.filter(is_active=True).count()
    return {
        'situation': {
            'all': total,
            'active': active,
            'pending': base.filter(pending_amount__gt=0).count(),
            'deactivated': total - active,
        },
    }


def build_customers_summary(shop, now: datetime | None = None) -> dict:
    """Indicateurs de la page Clients : actifs, à encaisser, nouveaux ce mois-ci."""
    customers = Customer.objects.filter(shop=shop)
    # Somme en Python : un agrégat ne peut pas porter sur l'annotation `pending_amount`.
    pending = list(
        customers_with_stats(shop).filter(pending_amount__gt=0)
        .values_list('pending_amount', flat=True),
    )
    start, end = current_month_bounds(shop, now or timezone.now())
    return {
        'active': {'count': customers.filter(is_active=True).count()},
        'due': {'count': len(pending), 'amount': str(sum(pending, Decimal('0.00')))},
        'new_this_month': {
            'count': customers.filter(
                created_at__gte=start, created_at__lt=end,
            ).count(),
        },
    }


EVENT_ORDER = 'order'
EVENT_PAYMENT = 'payment'
EVENT_SHIPMENT = 'shipment'
EVENT_NOTE = 'note'
EVENT_TYPES = (EVENT_ORDER, EVENT_PAYMENT, EVENT_SHIPMENT, EVENT_NOTE)
ALL_TYPES: frozenset[str] = frozenset(EVENT_TYPES)
# Date de l'événement dans la requête de chaque type (`event_at` : tirée du journal).
EVENT_DATE_FIELDS = {
    EVENT_ORDER: 'created_at', EVENT_PAYMENT: 'event_at',
    EVENT_SHIPMENT: 'event_at', EVENT_NOTE: 'created_at',
}
# Bornes [début, fin) d'une période ; `None` : sans limite.
Period = tuple[datetime | None, datetime | None]


class TimelineEvent(TypedDict):
    id: str
    type: str
    occurred_at: datetime
    data: dict


def _latest_order_log(action: str, **changes: str) -> Coalesce:
    """Date du dernier `AuditLog` `action` de la commande, sinon sa date de création."""
    logs = AuditLog.objects.filter(
        shop_id=OuterRef('shop_id'),
        object_id=Cast(OuterRef('pk'), CharField()),
        action=action,
        **{f'changes__{key}': value for key, value in changes.items()},
    ).order_by('-created_at').values('created_at')[:1]
    return Coalesce(Subquery(logs), F('created_at'))


def _order_event(order: Order) -> TimelineEvent:
    oid = str(order.id)
    return TimelineEvent(id=f'order-{oid}', type=EVENT_ORDER, occurred_at=order.created_at, data={  # noqa: E501
        'order_id': oid,
        'order_number': order.order_number,
        'total_amount': str(order.total_amount),
        'status': order.status,
        'payment_status': order.payment_status,
    })


def _payment_event(order: Order) -> TimelineEvent:
    oid = str(order.id)
    return TimelineEvent(id=f'payment-{oid}', type=EVENT_PAYMENT, occurred_at=order.event_at, data={  # noqa: E501
        'order_id': oid,
        'order_number': order.order_number,
        'payment_status': order.payment_status,
        'amount_paid': str(order.amount_paid),
        'total_amount': str(order.total_amount),
    })


def _shipment_event(order: Order) -> TimelineEvent:
    oid = str(order.id)
    return TimelineEvent(id=f'shipment-{oid}', type=EVENT_SHIPMENT, occurred_at=order.event_at, data={  # noqa: E501
        'order_id': oid,
        'order_number': order.order_number,
    })


def _note_event(note: Note) -> TimelineEvent:
    author_name: str | None = None
    if note.author_id is not None:
        author_name = note.author.full_name or note.author.email
    return TimelineEvent(id=f'note-{note.id}', type=EVENT_NOTE, occurred_at=note.created_at, data={  # noqa: E501
        'content': note.content,
        'author_name': author_name,
        'order_id': str(note.order_id) if note.order_id else None,
    })


def customer_timeline_sources(
    customer: Customer,
    types: Iterable[str] | None = None,
    pending_only: bool = False,
) -> list[TimelineSource]:
    """Sources de la timeline d'activité du client, à fenêtrer avec `window_timeline`.

    Par commande, jusqu'à trois événements synthétisés :

    - ``order`` (toujours) : création de la commande ;
    - ``payment`` (toujours) : ``payment_status`` actuel, daté du dernier
      ``order_payment_change`` s'il existe, sinon de la création ;
    - ``shipment`` (commande expédiée) : daté du dernier ``order_status_change``
      vers ``shipped``.

    Plus un événement ``note`` par note du client.

    ``pending_only`` : seulement les commandes avec un reste à payer (``unpaid`` ou
    ``partial``, non annulées) et leurs notes ; les notes sans commande sont exclues.

    Chaque source est triée par la date de son événement, la plus récente d'abord :
    la timeline n'est jamais chargée en entier.
    """
    querysets = _timeline_querysets(customer, types or ALL_TYPES, pending_only)
    return [(qs, _TIMELINE_EVENTS[kind]) for kind, qs in querysets.items()]


def _within(qs: QuerySet, field: str, period: Period) -> QuerySet:
    start, end = period
    if start is not None:
        qs = qs.filter(**{f'{field}__gte': start})
    if end is not None:
        qs = qs.filter(**{f'{field}__lt': end})
    return qs


def _timeline_querysets(
    customer: Customer,
    types: Iterable[str],
    pending_only: bool,
    period: Period = (None, None),
) -> dict[str, QuerySet]:
    """Requête de chaque type d'événement choisi, dans l'ordre de `EVENT_TYPES`,
    limitée à `period` ([début, fin)) et triée du plus récent au plus ancien."""
    selected = set(types) & ALL_TYPES
    orders = Order.objects.filter(customer=customer, shop_id=customer.shop_id).only(
        'id', 'shop_id', 'order_number', 'total_amount',
        'status', 'payment_status', 'amount_paid', 'created_at',
    )
    if pending_only:
        orders = orders.filter(payment_status__in=['unpaid', 'partial']).exclude(status='cancelled')  # noqa: E501

    built: dict[str, QuerySet] = {}
    if EVENT_ORDER in selected:
        built[EVENT_ORDER] = orders
    if EVENT_PAYMENT in selected:
        built[EVENT_PAYMENT] = orders.annotate(event_at=_latest_order_log('order_payment_change'))  # noqa: E501
    if EVENT_SHIPMENT in selected:
        built[EVENT_SHIPMENT] = orders.filter(status='shipped').annotate(
            event_at=_latest_order_log('order_status_change', to='shipped'),
        )
    if EVENT_NOTE in selected:
        notes = Note.objects.filter(customer=customer, shop_id=customer.shop_id)
        if pending_only:
            notes = notes.filter(order__in=orders.values('pk'))
        built[EVENT_NOTE] = notes.select_related('author').only(
            'id', 'content', 'order_id', 'created_at',
            'author__full_name', 'author__email',
        )
    return {
        kind: _within(qs, EVENT_DATE_FIELDS[kind], period).order_by(
            f'-{EVENT_DATE_FIELDS[kind]}', '-pk',
        )
        for kind, qs in built.items()
    }


_TIMELINE_EVENTS = {
    EVENT_ORDER: _order_event,
    EVENT_PAYMENT: _payment_event,
    EVENT_SHIPMENT: _shipment_event,
    EVENT_NOTE: _note_event,
}




# ── Export CSV de l'activité ─────────────────────────────────────────────────

class _Echo:
    """Tampon de `csv.writer` : rend la ligne au lieu de l'écrire (réponse en flux)."""

    def write(self, value: str) -> str:
        return value


@dataclass(frozen=True)
class ActivityExport:
    filename: str
    rows: Iterator[str]


def local_period(
    shop: Shop, date_from: date | None, date_to: date | None,
) -> Period:
    """Bornes [début, fin) des jours `date_from` à `date_to` inclus, au fuseau de la
    boutique."""
    tz = ZoneInfo(shop.timezone)
    start = datetime.combine(date_from, time.min, tz) if date_from else None
    end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tz) if date_to else None
    )
    return start, end


def activity_counts(
    customer: Customer, period: Period = (None, None), pending_only: bool = False,
) -> dict[str, int]:
    """Nombre d'événements de chaque type pour la période : lignes de l'export."""
    querysets = _timeline_querysets(customer, ALL_TYPES, pending_only, period)
    return {kind: querysets[kind].count() for kind in EVENT_TYPES}


def _author_name(prefix: str) -> Coalesce:
    """Nom de l'utilisateur au bout de `prefix`, sinon son e-mail."""
    return Coalesce(
        NullIf(F(f'{prefix}full_name'), Value('')), F(f'{prefix}email'),
        output_field=CharField(),
    )


def _latest_log_author(action: str, **changes: str) -> Coalesce:
    """Auteur du dernier `AuditLog` `action` de la commande, sinon son créateur."""
    logs = AuditLog.objects.filter(
        shop_id=OuterRef('shop_id'),
        object_id=Cast(OuterRef('pk'), CharField()),
        action=action,
        **{f'changes__{key}': value for key, value in changes.items()},
    ).order_by('-created_at').annotate(name=_author_name('user__')).values('name')[:1]
    return Coalesce(
        Subquery(logs), _author_name('created_by__'), output_field=CharField(),
    )


_EXPORT_AUTHORS = {
    EVENT_ORDER: lambda: {'author_name': _author_name('created_by__')},
    EVENT_PAYMENT: lambda: {'author_name': _latest_log_author('order_payment_change')},
    EVENT_SHIPMENT: lambda: {
        'author_name': _latest_log_author('order_status_change', to='shipped'),
    },
    EVENT_NOTE: lambda: {
        'author_name': _author_name('author__'), 'reference': F('order__order_number'),
    },
}


def _amount(value: Decimal | None, lang: str) -> str:
    """Montant au séparateur décimal de la langue, chiffres latins, sans milliers."""
    if value is None:
        return ''
    separator = get_decimal_symbol(lang, numbering_system='latn')
    return f'{value:.2f}'.replace('.', separator)


def _export_cells(kind: str, item: Order | Note, texts: dict, lang: str) -> list[str]:
    """Type, référence, description, montant et statut d'un événement."""
    if isinstance(item, Note):
        content = spreadsheet_safe(item.content)
        return [texts['types'][kind], item.reference or '', content, '', '']
    if kind == EVENT_PAYMENT:
        description = texts['description'][f'payment_{item.payment_status}']
        return [texts['types'][kind], item.order_number, description,
                _amount(item.amount_paid, lang), texts['status'][item.payment_status]]
    amount = _amount(item.total_amount, lang) if kind == EVENT_ORDER else ''
    status = item.status if kind == EVENT_ORDER else 'shipped'
    return [texts['types'][kind], item.order_number, texts['description'][kind],
            amount, texts['status'][status]]


def _dated_events(
    kind: str, qs: QuerySet,
) -> Iterator[tuple[datetime, str, Order | Note]]:
    """(date, type, objet) des événements d'un type, lus par paquets, avec l'auteur."""
    for item in qs.annotate(**_EXPORT_AUTHORS[kind]()).iterator(chunk_size=500):
        yield getattr(item, EVENT_DATE_FIELDS[kind]), kind, item


def _export_lines(
    querysets: dict[str, QuerySet], tz: ZoneInfo, lang: str,
) -> Iterator[str]:
    """BOM, en-tête puis une ligne par événement, du plus récent au plus ancien."""
    texts = EXPORT_TEXTS[lang]
    writer = csv.writer(_Echo(), delimiter=';')
    yield '\ufeff' + writer.writerow([texts['columns'][c] for c in EXPORT_COLUMNS])
    streams = [_dated_events(kind, qs) for kind, qs in querysets.items()]
    for occurred_at, kind, item in heapq.merge(*streams, key=lambda e: e[0], reverse=True):  # noqa: E501
        local = occurred_at.astimezone(tz).strftime('%Y-%m-%d %H:%M')
        cells = _export_cells(kind, item, texts, lang)
        yield writer.writerow([local, *cells, spreadsheet_safe(item.author_name)])


def export_customer_activity(
    customer: Customer, *, user: User, types: Iterable[str] | None = None,
    date_from: date | None = None, date_to: date | None = None,
    pending_only: bool = False, lang: str | None = None,
) -> ActivityExport:
    """Export CSV de l'activité (UTF-8 avec BOM, « ; »), dans la langue `lang` (celle de
    l'interface), sinon celle du compte de `user`.

    Mêmes événements et filtres que la timeline ; chaque export est consigné dans le
    journal d'audit (types, période, nombre de lignes).
    """
    shop = customer.shop
    tz = ZoneInfo(shop.timezone)
    selected = sorted(set(types or ALL_TYPES) & ALL_TYPES)
    period = local_period(shop, date_from, date_to)
    querysets = _timeline_querysets(customer, selected, pending_only, period)
    rows = sum(qs.count() for qs in querysets.values())
    AuditLog.objects.create(
        shop_id=shop.id, user=user, action='customer_activity_export',
        model_name='Customer', object_id=str(customer.id),
        object_repr=customer.display_name[:200],
        changes={
            'format': 'csv', 'types': selected, 'pending': pending_only, 'rows': rows,
            'from': date_from.isoformat() if date_from else None,
            'to': date_to.isoformat() if date_to else None,
        },
    )
    lang = next((code for code in (lang, user.language) if code in EXPORT_TEXTS), 'fr')
    slug = slugify(customer.display_name, allow_unicode=True) or 'client'
    today = timezone.now().astimezone(tz).date().isoformat()
    return ActivityExport(
        filename=f'activite-{slug}-{today}.csv',
        rows=_export_lines(querysets, tz, lang),
    )
