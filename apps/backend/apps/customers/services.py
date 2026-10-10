from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Iterable, TypedDict

from django.db.models import (
    Count, DecimalField, Exists, F, Max, OuterRef, Q, QuerySet, Sum, Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.models import AuditLog
from apps.notes.models import Note
from apps.orders.models import Order
from apps.orders.services import current_month_bounds

from .models import Customer


# Champs de recherche de la liste, partagés avec les facettes.
CUSTOMER_SEARCH_FIELDS = ('name', 'phone', 'email', 'city')
SITUATIONS = ('all', 'active', 'pending', 'deactivated')

_MONEY = DecimalField(max_digits=12, decimal_places=2)
_NOT_CANCELLED = ~Q(orders__status='cancelled')


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


def get_customer_timeline(
    customer: Customer,
    types: Iterable[str] | None = None,
    pending_only: bool = False,
) -> list[TimelineEvent]:
    """Return a mixed activity timeline for the customer.

    For each order, generates up to three synthesized events:

    - ``order`` (always): order creation
    - ``payment`` (always): current ``payment_status`` of the order. Dated by
      the latest ``order_payment_change`` audit log if any, else ``created_at``.
    - ``shipment`` (only if order.status == 'shipped'): dated by the latest
      ``order_status_change`` audit log with ``to='shipped'``.

    Plus one ``note`` event per customer note.

    When ``pending_only`` is True, restricts to orders with outstanding balance
    (``payment_status`` in {unpaid, partial} and not cancelled). Customer-level
    notes (notes without ``order_id``) are excluded in this mode.

    Results sorted by ``occurred_at`` descending.
    """
    selected = {t for t in (types or ALL_TYPES) if t in ALL_TYPES}
    if not selected:
        return []

    events: list[TimelineEvent] = []
    order_by_id: dict[str, Order] = {}
    need_orders = bool({EVENT_ORDER, EVENT_PAYMENT, EVENT_SHIPMENT} & selected) or pending_only  # noqa: E501

    if need_orders:
        order_qs = Order.objects.filter(
            customer=customer,
            shop_id=customer.shop_id,
        ).only(
            'id', 'order_number', 'total_amount',
            'status', 'payment_status', 'amount_paid', 'created_at',
        )
        if pending_only:
            order_qs = order_qs.filter(
                payment_status__in=['unpaid', 'partial'],
            ).exclude(status='cancelled')
        order_by_id = {str(o.id): o for o in order_qs}

    # Fetch latest payment/shipment audit logs in a single query.
    latest_payment_at: dict[str, datetime] = {}
    latest_shipment_at: dict[str, datetime] = {}
    if order_by_id:
        log_qs = AuditLog.objects.filter(
            shop_id=customer.shop_id,
            object_id__in=list(order_by_id.keys()),
            action__in=['order_payment_change', 'order_status_change'],
        ).only('action', 'object_id', 'changes', 'created_at').order_by('created_at')
        for log in log_qs:
            if log.action == 'order_payment_change':
                latest_payment_at[log.object_id] = log.created_at
            elif log.action == 'order_status_change' and log.changes.get('to') == 'shipped':  # noqa: E501
                latest_shipment_at[log.object_id] = log.created_at

    for order in order_by_id.values():
        oid = str(order.id)
        if EVENT_ORDER in selected:
            events.append(TimelineEvent(
                id=f'order-{oid}',
                type=EVENT_ORDER,
                occurred_at=order.created_at,
                data={
                    'order_id': oid,
                    'order_number': order.order_number,
                    'total_amount': str(order.total_amount),
                    'status': order.status,
                    'payment_status': order.payment_status,
                },
            ))
        if EVENT_PAYMENT in selected:
            events.append(TimelineEvent(
                id=f'payment-{oid}',
                type=EVENT_PAYMENT,
                occurred_at=latest_payment_at.get(oid, order.created_at),
                data={
                    'order_id': oid,
                    'order_number': order.order_number,
                    'payment_status': order.payment_status,
                    'amount_paid': str(order.amount_paid),
                    'total_amount': str(order.total_amount),
                },
            ))
        if EVENT_SHIPMENT in selected and order.status == 'shipped':
            shipped_at = latest_shipment_at.get(oid, order.created_at)
            events.append(TimelineEvent(
                id=f'shipment-{oid}',
                type=EVENT_SHIPMENT,
                occurred_at=shipped_at,
                data={
                    'order_id': oid,
                    'order_number': order.order_number,
                },
            ))

    if EVENT_NOTE in selected:
        note_qs = Note.objects.filter(
            customer=customer,
            shop_id=customer.shop_id,
        ).select_related('author').only(
            'id', 'content', 'order_id', 'created_at',
            'author__full_name', 'author__email',
        )
        if pending_only:
            # En mode "à encaisser", exclure les notes sans commande et celles
            # liées à des commandes déjà payées / annulées.
            note_qs = note_qs.filter(order_id__in=list(order_by_id.keys()))
        for note in note_qs:
            author_name: str | None = None
            if note.author_id is not None:
                author_name = note.author.full_name or note.author.email
            events.append(TimelineEvent(
                id=f'note-{note.id}',
                type=EVENT_NOTE,
                occurred_at=note.created_at,
                data={
                    'content': note.content,
                    'author_name': author_name,
                    'order_id': str(note.order_id) if note.order_id else None,
                },
            ))

    events.sort(key=lambda e: e['occurred_at'], reverse=True)
    return events
