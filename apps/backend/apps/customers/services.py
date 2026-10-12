from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Iterable, TypedDict

import phonenumbers
from django.db.models import (
    CharField, Count, DecimalField, Exists, F, Max, OuterRef, Q, QuerySet, Subquery,
    Sum, Value,
)
from django.db.models.functions import Cast, Coalesce
from django.utils import timezone

from apps.core.models import AuditLog
from apps.core.pagination import TimelineSource
from apps.notes.models import Note
from apps.orders.models import Order
from apps.orders.services import current_month_bounds

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
ALL_TYPES: frozenset[str] = frozenset({EVENT_ORDER, EVENT_PAYMENT, EVENT_SHIPMENT, EVENT_NOTE})  # noqa: E501


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
    selected = {t for t in (types or ALL_TYPES) if t in ALL_TYPES}
    orders = Order.objects.filter(customer=customer, shop_id=customer.shop_id).only(
        'id', 'shop_id', 'order_number', 'total_amount',
        'status', 'payment_status', 'amount_paid', 'created_at',
    )
    if pending_only:
        orders = orders.filter(payment_status__in=['unpaid', 'partial']).exclude(status='cancelled')  # noqa: E501

    sources: list[TimelineSource] = []
    if EVENT_ORDER in selected:
        sources.append((orders.order_by('-created_at', '-pk'), _order_event))
    if EVENT_PAYMENT in selected:
        paid = orders.annotate(event_at=_latest_order_log('order_payment_change'))
        sources.append((paid.order_by('-event_at', '-pk'), _payment_event))
    if EVENT_SHIPMENT in selected:
        shipped = orders.filter(status='shipped').annotate(
            event_at=_latest_order_log('order_status_change', to='shipped'),
        )
        sources.append((shipped.order_by('-event_at', '-pk'), _shipment_event))
    if EVENT_NOTE in selected:
        notes = Note.objects.filter(customer=customer, shop_id=customer.shop_id)
        if pending_only:
            notes = notes.filter(order__in=orders.values('pk'))
        notes = notes.select_related('author').only(
            'id', 'content', 'order_id', 'created_at',
            'author__full_name', 'author__email',
        )
        sources.append((notes.order_by('-created_at', '-pk'), _note_event))
    return sources
