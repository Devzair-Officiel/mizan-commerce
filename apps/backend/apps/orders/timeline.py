"""Construction de la timeline d'activité d'une commande.

Sépare la logique de présentation (aggrégation `AuditLog` + `Note`) du module
`services.py` qui contient la logique transactionnelle (réservation de stock,
transitions de statut, calculs).
"""

from __future__ import annotations

from datetime import datetime
from typing import TypedDict

from apps.core.models import AuditLog
from apps.notes.models import Note

from .models import Order

EVENT_CREATED = 'created'
EVENT_STATUS_CHANGE = 'status_change'
EVENT_PAYMENT_CHANGE = 'payment_change'
EVENT_NOTE = 'note'


class OrderTimelineEvent(TypedDict):
    id: str
    type: str
    occurred_at: datetime
    actor_name: str | None
    data: dict


def get_order_timeline(order: Order) -> list[OrderTimelineEvent]:
    """Retourne les événements significatifs d'une commande, du plus récent au plus ancien.

    Combine les `AuditLog` (création, transitions de statut, changements de paiement) avec
    les `Note` attachées à la commande.
    """
    events: list[OrderTimelineEvent] = []
    has_created_log = _append_audit_events(order, events)
    if not has_created_log:
        events.append(_synthesize_creation_event(order))
    _append_note_events(order, events)
    events.sort(key=lambda e: e['occurred_at'], reverse=True)
    return events


def _append_audit_events(order: Order, events: list[OrderTimelineEvent]) -> bool:
    """Ajoute les événements issus d'`AuditLog`. Retourne True si un évènement
    `order_created` a été trouvé (utile pour décider du fallback)."""
    log_qs = AuditLog.objects.filter(
        shop_id=order.shop_id,
        object_id=str(order.pk),
        action__in=['order_created', 'order_status_change', 'order_payment_change'],
    ).select_related('user').only(
        'id', 'action', 'changes', 'created_at',
        'user__full_name', 'user__email',
    )

    has_created_log = False
    for log in log_qs:
        actor_name = _actor_name(log.user_id, log.user if log.user_id is not None else None)
        if log.action == 'order_created':
            has_created_log = True
            events.append(OrderTimelineEvent(
                id=f'log-{log.id}',
                type=EVENT_CREATED,
                occurred_at=log.created_at,
                actor_name=actor_name,
                data={'order_number': log.changes.get('order_number', order.order_number)},
            ))
        elif log.action == 'order_status_change':
            events.append(OrderTimelineEvent(
                id=f'log-{log.id}',
                type=EVENT_STATUS_CHANGE,
                occurred_at=log.created_at,
                actor_name=actor_name,
                data={
                    'from': log.changes.get('from'),
                    'to': log.changes.get('to'),
                },
            ))
        elif log.action == 'order_payment_change':
            events.append(OrderTimelineEvent(
                id=f'log-{log.id}',
                type=EVENT_PAYMENT_CHANGE,
                occurred_at=log.created_at,
                actor_name=actor_name,
                data={
                    'from': log.changes.get('from'),
                    'to': log.changes.get('to'),
                    'amount_paid_before': log.changes.get('amount_paid_before'),
                    'amount_paid_after': log.changes.get('amount_paid_after'),
                },
            ))
    return has_created_log


def _append_note_events(order: Order, events: list[OrderTimelineEvent]) -> None:
    note_qs = Note.objects.filter(order=order, shop_id=order.shop_id).select_related('author').only(
        'id', 'content', 'created_at',
        'author__full_name', 'author__email',
    )
    for note in note_qs:
        actor_name = _actor_name(note.author_id, note.author if note.author_id is not None else None)
        events.append(OrderTimelineEvent(
            id=f'note-{note.id}',
            type=EVENT_NOTE,
            occurred_at=note.created_at,
            actor_name=actor_name,
            data={'content': note.content, 'note_id': str(note.id)},
        ))


def _synthesize_creation_event(order: Order) -> OrderTimelineEvent:
    """Fallback pour les commandes antérieures à l'instrumentation `AuditLog`."""
    return OrderTimelineEvent(
        id=f'order-{order.pk}',
        type=EVENT_CREATED,
        occurred_at=order.created_at,
        actor_name=None,
        data={'order_number': order.order_number},
    )


def _actor_name(user_id, user) -> str | None:
    if user_id is None or user is None:
        return None
    return user.full_name or user.email
