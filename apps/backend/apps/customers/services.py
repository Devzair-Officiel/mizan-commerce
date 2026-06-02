from __future__ import annotations

from datetime import datetime
from typing import Iterable, TypedDict

from apps.core.models import AuditLog
from apps.notes.models import Note
from apps.orders.models import Order

from .models import Customer


EVENT_ORDER = 'order'
EVENT_PAYMENT = 'payment'
EVENT_SHIPMENT = 'shipment'
EVENT_NOTE = 'note'
ALL_TYPES: frozenset[str] = frozenset({EVENT_ORDER, EVENT_PAYMENT, EVENT_SHIPMENT, EVENT_NOTE})


class TimelineEvent(TypedDict):
    id: str
    type: str
    occurred_at: datetime
    data: dict


def get_customer_timeline(
    customer: Customer,
    types: Iterable[str] | None = None,
) -> list[TimelineEvent]:
    """Return a mixed activity timeline for the customer.

    For each order, generates up to three synthesized events:

    - ``order`` (always): order creation
    - ``payment`` (always): current ``payment_status`` of the order. Dated by
      the latest ``order_payment_change`` audit log if any, else ``created_at``.
    - ``shipment`` (only if order.status == 'shipped'): dated by the latest
      ``order_status_change`` audit log with ``to='shipped'``.

    Plus one ``note`` event per customer note.

    Results sorted by ``occurred_at`` descending.
    """
    selected = {t for t in (types or ALL_TYPES) if t in ALL_TYPES}
    if not selected:
        return []

    events: list[TimelineEvent] = []
    order_by_id: dict[str, Order] = {}
    need_orders = bool({EVENT_ORDER, EVENT_PAYMENT, EVENT_SHIPMENT} & selected)

    if need_orders:
        order_qs = Order.objects.filter(
            customer=customer,
            shop_id=customer.shop_id,
        ).only(
            'id', 'order_number', 'total_amount',
            'status', 'payment_status', 'amount_paid', 'created_at',
        )
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
            elif log.action == 'order_status_change' and log.changes.get('to') == 'shipped':
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
