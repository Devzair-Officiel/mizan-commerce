from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import log_action
from apps.products.models import ProductVariant
from apps.stock.services import create_movement
from .models import Order, OrderItem
from .timeline import (  # ré-exports pour la rétro-compat des imports `services.*`
    EVENT_CREATED,
    EVENT_NOTE,
    EVENT_PAYMENT_CHANGE,
    EVENT_STATUS_CHANGE,
    OrderTimelineEvent,
    get_order_timeline,
)

__all__ = [
    'EVENT_CREATED',
    'EVENT_NOTE',
    'EVENT_PAYMENT_CHANGE',
    'EVENT_STATUS_CHANGE',
    'OrderTimelineEvent',
    'add_item',
    'advance_order_to',
    'allowed_transitions',
    'build_items_preview_batch',
    'create_order',
    'generate_order_number',
    'get_order_timeline',
    'recalculate_totals',
    'remove_item',
    'reserve_stock',
    'transition_status',
    'update_item_quantity',
    'update_payment',
]


def allowed_transitions(order: Order) -> list[str]:
    """Transitions autorisées selon le statut et le mode de livraison."""  # noqa: E501
    fm = order.shop.fulfillment_mode
    if order.status == 'to_prepare':
        forward = 'prepared' if fm == 'delivery' else 'shipped'
        return [forward, 'cancelled']
    if order.status == 'prepared':
        return ['shipped', 'cancelled', 'to_prepare']
    if order.status == 'shipped':
        return ['prepared'] if fm == 'delivery' else ['to_prepare']
    if order.status == 'cancelled':
        return ['to_prepare']
    return []


def advance_order_to(order: Order, target_status: str, user) -> Order:
    """Avance order jusqu'à target_status en enchaînant les transitions autorisées.

    No-op si l'order est déjà au statut cible. Lève ValueError si target_status
    est inaccessible depuis le statut courant pour ce fulfillment_mode.
    """
    if order.status == target_status:
        return order

    fm = order.shop.fulfillment_mode

    def _allowed(s: str) -> list[str]:
        if s == 'to_prepare':
            return ['prepared' if fm == 'delivery' else 'shipped', 'cancelled']
        if s == 'prepared':
            return ['shipped', 'cancelled', 'to_prepare']
        if s == 'shipped':
            return ['prepared'] if fm == 'delivery' else ['to_prepare']
        if s == 'cancelled':
            return ['to_prepare']
        return []

    from collections import deque
    queue: deque[list[str]] = deque([[order.status]])
    visited: set[str] = {order.status}
    path: list[str] | None = None
    while queue and path is None:
        current_path = queue.popleft()
        for next_s in _allowed(current_path[-1]):
            if next_s == target_status:
                path = current_path + [next_s]
                break
            if next_s not in visited:
                visited.add(next_s)
                queue.append(current_path + [next_s])

    if path is None:
        raise ValueError(
            f"Transition impossible : impossible d'atteindre '{target_status}' "
            f"depuis '{order.status}' (fulfillment_mode={fm!r})."
        )
    for next_s in path[1:]:
        order = transition_status(order, next_s, user)
    return order


def generate_order_number(shop) -> str:
    """Génère un numéro de commande unique par boutique : YYYY-NNN (race-condition safe)."""  # noqa: E501
    year = timezone.now().year
    with transaction.atomic():
        last = (
            Order.objects
            .filter(shop=shop, order_number__startswith=f'{year}-')
            .select_for_update()
            .order_by('-order_number')
            .first()
        )
        seq = int(last.order_number.split('-')[1]) + 1 if last else 1
        return f'{year}-{seq:03d}'


def recalculate_totals(order: Order) -> None:
    """Recalcule subtotal et total_amount à partir des lignes."""
    subtotal = sum((item.line_total for item in order.items.all()), Decimal('0'))
    order.subtotal = subtotal
    order.total_amount = subtotal - Decimal(str(order.discount_amount)) + Decimal(str(order.shipping_amount))  # noqa: E501
    order.save(update_fields=['subtotal', 'total_amount', 'updated_at'])


@transaction.atomic
def create_order(shop, user, customer=None, discount=Decimal('0'), shipping=Decimal('0')) -> Order:  # noqa: E501
    from apps.subscriptions.limits import enforce_orders_per_month_limit
    enforce_orders_per_month_limit(shop)
    order = Order.objects.create(
        shop=shop,
        customer=customer,
        order_number=generate_order_number(shop),
        discount_amount=discount,
        shipping_amount=shipping,
        created_by=user,
    )
    log_action(
        shop_id=order.shop_id,
        user=user,
        action='order_created',
        model_name='Order',
        obj_id=order.pk,
        obj_repr=str(order),
        changes={'order_number': order.order_number},
    )
    return order


@transaction.atomic
def add_item(
    order: Order,
    variant: ProductVariant | None,
    quantity: int,
    unit_price: Decimal | None = None,
    product_name: str | None = None,
    user=None,
) -> OrderItem:
    """
    Ajoute une ligne à la commande (autorisé en to_prepare et prepared).
    Si le stock est déjà réservé, crée immédiatement le mouvement delta.
    """
    order = Order.objects.select_for_update().get(pk=order.pk)

    if order.status not in ('to_prepare', 'prepared'):
        raise ValueError("Impossible d'ajouter un article à une commande non modifiable.")  # noqa: E501

    if variant is None:
        if not product_name or unit_price is None:
            raise ValueError("Ligne libre : nom et prix requis.")
        name = product_name
        v_name = ''
        price = unit_price
    else:
        name = variant.product.name
        v_name = variant.packaging_name
        price = unit_price if unit_price is not None else variant.selling_price

    item = OrderItem.objects.create(
        shop=order.shop,
        order=order,
        variant=variant,
        product_name=name,
        variant_name=v_name,
        unit_price=price,
        quantity=quantity,
    )

    if order.stock_reserved and variant and variant.product.type == 'product':
        create_movement(
            shop=order.shop,
            variant=variant,
            movement_type='reservation',
            quantity=quantity,
            reason=f'Ajout article commande {order.order_number}',
            order_id=order.id,
            created_by=user,
        )

    recalculate_totals(order)
    return item


@transaction.atomic
def update_item_quantity(order: Order, item: OrderItem, quantity: int, user=None) -> OrderItem:  # noqa: E501
    order = Order.objects.select_for_update().get(pk=order.pk)
    item = OrderItem.objects.select_related('variant__product').select_for_update(of=('self',)).get(pk=item.pk)  # noqa: E501

    if order.status not in ('to_prepare', 'prepared'):
        raise ValueError("Impossible de modifier un article d'une commande non modifiable.")  # noqa: E501

    old_qty = item.quantity
    delta = quantity - old_qty
    item.quantity = quantity
    item.save(update_fields=['quantity'])
    recalculate_totals(order)

    if order.stock_reserved and delta != 0 and item.variant and item.variant.product.type == 'product':  # noqa: E501
        create_movement(
            shop=order.shop,
            variant=item.variant,
            movement_type='reservation' if delta > 0 else 'release',
            quantity=abs(delta),
            reason=f'Modification article commande {order.order_number}',
            order_id=order.id,
            created_by=user,
        )

    return item


@transaction.atomic
def remove_item(order: Order, item: OrderItem, user=None) -> None:
    order = Order.objects.select_for_update().get(pk=order.pk)
    item = OrderItem.objects.select_related('variant__product').select_for_update(of=('self',)).get(pk=item.pk)  # noqa: E501

    if order.status not in ('to_prepare', 'prepared'):
        raise ValueError("Impossible de retirer un article d'une commande non modifiable.")  # noqa: E501

    if order.stock_reserved and item.variant and item.variant.product.type == 'product':
        create_movement(
            shop=order.shop,
            variant=item.variant,
            movement_type='release',
            quantity=item.quantity,
            reason=f'Suppression article commande {order.order_number}',
            order_id=order.id,
            created_by=user,
        )

    item.delete()
    recalculate_totals(order)


@transaction.atomic
def transition_status(order: Order, new_status: str, user) -> Order:
    Order.objects.select_for_update().get(pk=order.pk)  # acquire row lock
    order.refresh_from_db()  # re-read fresh state into the original object
    allowed = allowed_transitions(order)
    if new_status not in allowed:
        raise ValueError(
            f"Transition interdite : {order.status} → {new_status}. "
            f"Transitions possibles : {allowed or 'aucune'}."
        )

    previous_status = order.status

    # Annulation : libérer le stock réservé
    if new_status == 'cancelled':
        _release_stock(order, user)
        order.cancelled_at = timezone.now()

    # Réactivation depuis annulé → re-réserver le stock
    if new_status == 'to_prepare' and previous_status == 'cancelled':
        reserve_stock(order, user)
        order.cancelled_at = None

    order.status = new_status
    order.updated_by = user
    order.save(update_fields=['status', 'cancelled_at', 'updated_by', 'updated_at'])

    # Lors d'une annulation, propager à la facture liée si elle existe.
    if new_status == 'cancelled':
        from apps.invoices.services import sync_invoice_from_order
        sync_invoice_from_order(order)

    log_action(
        shop_id=order.shop_id,
        user=user,
        action='order_status_change',
        model_name='Order',
        obj_id=order.pk,
        obj_repr=str(order),
        changes={'from': previous_status, 'to': new_status},
    )
    return order


def reserve_stock(order: Order, user) -> None:
    """Crée un mouvement 'reservation' pour chaque ligne produit (skip services et lignes libres)."""  # noqa: E501
    if order.stock_reserved:
        return
    for item in order.items.select_related('variant__product').all():
        if item.variant and item.variant.product.type == 'product':
            create_movement(
                shop=order.shop,
                variant=item.variant,
                movement_type='reservation',
                quantity=item.quantity,
                reason=f'Réservation commande {order.order_number}',
                order_id=order.id,
                created_by=user,
            )
    order.stock_reserved = True
    order.save(update_fields=['stock_reserved', 'updated_at'])


def _release_stock(order: Order, user) -> None:
    """Libère le stock réservé (skip services et lignes libres)."""
    if not order.stock_reserved:
        return
    for item in order.items.select_related('variant__product').all():
        if item.variant and item.variant.product.type == 'product':
            create_movement(
                shop=order.shop,
                variant=item.variant,
                movement_type='release',
                quantity=item.quantity,
                reason=f'Annulation commande {order.order_number}',
                order_id=order.id,
                created_by=user,
            )
    order.stock_reserved = False
    order.save(update_fields=['stock_reserved', 'updated_at'])


def build_items_preview_batch(order_ids: list) -> dict:
    """Fetche items pour une liste d'IDs commande.

    Retourne {str(order_id): [{'name': ..., 'quantity': ...}, ...]}.
    """
    items_by_order: dict = {}
    qs = OrderItem.objects.filter(order_id__in=order_ids).values(
        'order_id', 'product_name', 'quantity',
    )
    for item in qs:
        oid = str(item['order_id'])
        items_by_order.setdefault(oid, []).append(
            {'name': item['product_name'], 'quantity': item['quantity']},
        )
    return items_by_order


@transaction.atomic
def update_payment(order: Order, amount_paid: Decimal, user=None) -> Order:
    previous_status = order.payment_status
    previous_amount = order.amount_paid
    order.amount_paid = amount_paid
    if amount_paid <= 0:
        order.payment_status = 'unpaid'
    elif amount_paid < order.total_amount:
        order.payment_status = 'partial'
    else:
        order.payment_status = 'paid'
    if user is not None:
        order.updated_by = user
        order.save(update_fields=['amount_paid', 'payment_status', 'updated_by', 'updated_at'])  # noqa: E501
    else:
        order.save(update_fields=['amount_paid', 'payment_status', 'updated_at'])

    # Propager le statut de paiement à la facture liée (si elle existe et n'est pas annulée).  # noqa: E501
    from apps.invoices.services import sync_invoice_from_order
    sync_invoice_from_order(order)

    log_action(
        shop_id=order.shop_id,
        user=user,
        action='order_payment_change',
        model_name='Order',
        obj_id=order.pk,
        obj_repr=str(order),
        changes={
            'from': previous_status,
            'to': order.payment_status,
            'amount_paid_before': str(previous_amount),
            'amount_paid_after': str(amount_paid),
        },
    )
    return order


