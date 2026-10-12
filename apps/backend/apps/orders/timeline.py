"""Construction de la timeline d'activité d'une commande.

Sépare la logique de présentation (aggrégation `AuditLog` + `Note`) du module
`services.py` qui contient la logique transactionnelle (réservation de stock,
transitions de statut, calculs).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import TypedDict

from apps.core.models import AuditLog
from apps.core.pagination import TimelineSource
from apps.notes.models import Note

from .models import Order

EVENT_CREATED = 'created'
EVENT_STATUS_CHANGE = 'status_change'
EVENT_PAYMENT_CHANGE = 'payment_change'
EVENT_NOTE = 'note'
ORDER_EVENT_TYPES: frozenset[str] = frozenset({EVENT_CREATED, EVENT_STATUS_CHANGE, EVENT_PAYMENT_CHANGE, EVENT_NOTE})  # noqa: E501

# Action `AuditLog` de chaque type d'événement issu du journal.
_LOG_ACTIONS = {
    EVENT_CREATED: 'order_created',
    EVENT_STATUS_CHANGE: 'order_status_change',
    EVENT_PAYMENT_CHANGE: 'order_payment_change',
}


class OrderTimelineEvent(TypedDict):
    id: str
    type: str
    occurred_at: datetime
    actor_name: str | None
    data: dict


def order_timeline_sources(
    order: Order, types: Iterable[str] | None = None,
) -> list[TimelineSource]:
    """Sources de la timeline d'une commande, à fenêtrer avec `window_timeline`.

    Combine les `AuditLog` (création, transitions de statut, changements de paiement) avec
    les `Note` attachées à la commande. Commande antérieure à l'instrumentation `AuditLog` :
    sa création est synthétisée depuis `created_at`.
    """  # noqa: E501
    selected = {t for t in (types or ORDER_EVENT_TYPES) if t in ORDER_EVENT_TYPES}
    order_logs = AuditLog.objects.filter(shop_id=order.shop_id, object_id=str(order.pk))  # noqa: E501
    sources: list[TimelineSource] = []
    actions = [action for t, action in _LOG_ACTIONS.items() if t in selected]
    if actions:
        logs = order_logs.filter(action__in=actions).select_related('user').only(
            'id', 'action', 'changes', 'created_at',
            'user__full_name', 'user__email',
        )
        sources.append((logs.order_by('-created_at', '-pk'), lambda log: _log_event(order, log)))  # noqa: E501
    if EVENT_CREATED in selected:
        # Création absente du journal : synthétisée depuis la commande.
        legacy = Order.objects.filter(pk=order.pk, shop_id=order.shop_id)
        if order_logs.filter(action='order_created').exists():
            legacy = legacy.none()
        sources.append((legacy, _synthesize_creation_event))
    if EVENT_NOTE in selected:
        notes = Note.objects.filter(order=order, shop_id=order.shop_id).select_related('author').only(  # noqa: E501
            'id', 'content', 'created_at',
            'author__full_name', 'author__email',
        )
        sources.append((notes.order_by('-created_at', '-pk'), _note_event))
    return sources


def _log_event(order: Order, log: AuditLog) -> OrderTimelineEvent:
    actor_name = _actor_name(log.user_id, log.user if log.user_id is not None else None)  # noqa: E501
    if log.action == 'order_created':
        return OrderTimelineEvent(
            id=f'log-{log.id}',
            type=EVENT_CREATED,
            occurred_at=log.created_at,
            actor_name=actor_name,
            data={'order_number': log.changes.get('order_number', order.order_number)},  # noqa: E501
        )
    if log.action == 'order_status_change':
        return OrderTimelineEvent(
            id=f'log-{log.id}',
            type=EVENT_STATUS_CHANGE,
            occurred_at=log.created_at,
            actor_name=actor_name,
            data={
                'from': log.changes.get('from'),
                'to': log.changes.get('to'),
            },
        )
    return OrderTimelineEvent(
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
    )


def _note_event(note: Note) -> OrderTimelineEvent:
    actor_name = _actor_name(note.author_id, note.author if note.author_id is not None else None)  # noqa: E501
    return OrderTimelineEvent(
        id=f'note-{note.id}',
        type=EVENT_NOTE,
        occurred_at=note.created_at,
        actor_name=actor_name,
        data={'content': note.content, 'note_id': str(note.id)},
    )


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
