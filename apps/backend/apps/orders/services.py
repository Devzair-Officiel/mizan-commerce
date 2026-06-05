from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import log_action
from apps.products.models import ProductVariant
from apps.stock.models import StockMovement
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
    'ALLOWED_TRANSITIONS',
    'EVENT_CREATED',
    'EVENT_NOTE',
    'EVENT_PAYMENT_CHANGE',
    'EVENT_STATUS_CHANGE',
    'OrderTimelineEvent',
    'add_item',
    'create_order',
    'generate_order_number',
    'get_order_timeline',
    'recalculate_totals',
    'remove_item',
    'transition_status',
    'update_item_quantity',
    'update_payment',
]

# Transitions de statut autorisées (avance + retour arrière)
ALLOWED_TRANSITIONS = {
    'draft':      ['to_prepare', 'cancelled'],
    'to_prepare': ['prepared', 'cancelled', 'draft'],
    'prepared':   ['shipped', 'cancelled', 'to_prepare'],
    'shipped':    ['prepared'],
    'cancelled':  ['draft'],
}


def generate_order_number(shop) -> str:
    """Génère un numéro de commande unique par boutique : YYYY-NNN (race-condition safe)."""
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
    order.total_amount = subtotal - Decimal(str(order.discount_amount)) + Decimal(str(order.shipping_amount))
    order.save(update_fields=['subtotal', 'total_amount', 'updated_at'])


@transaction.atomic
def create_order(shop, user, customer=None, discount=Decimal('0'), shipping=Decimal('0')) -> Order:
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
) -> OrderItem:
    """
    Ajoute une ligne à la commande.
    - Si variant est fourni : nom et prix par défaut viennent du catalogue.
    - Si variant est None (ligne libre) : product_name et unit_price sont requis.
    """
    if order.status != 'draft':
        raise ValueError("Impossible d'ajouter un article à une commande qui n'est plus en brouillon.")

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
    recalculate_totals(order)
    return item


@transaction.atomic
def update_item_quantity(order: Order, item: OrderItem, quantity: int) -> OrderItem:
    if order.status != 'draft':
        raise ValueError("Impossible de modifier un article d'une commande qui n'est plus en brouillon.")
    item.quantity = quantity
    item.save(update_fields=['quantity'])
    recalculate_totals(order)
    return item


@transaction.atomic
def remove_item(order: Order, item: OrderItem) -> None:
    if order.status != 'draft':
        raise ValueError("Impossible de retirer un article d'une commande qui n'est plus en brouillon.")
    item.delete()
    recalculate_totals(order)


@transaction.atomic
def transition_status(order: Order, new_status: str, user) -> Order:
    allowed = ALLOWED_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        raise ValueError(
            f"Transition interdite : {order.status} → {new_status}. "
            f"Transitions possibles : {allowed or 'aucune'}."
        )

    previous_status = order.status

    # Avance : draft → to_prepare → réserver le stock
    if new_status == 'to_prepare' and order.status == 'draft':
        _reserve_stock(order, user)

    # Retour arrière : to_prepare → draft → libérer la réservation
    if new_status == 'draft' and order.status == 'to_prepare':
        _release_stock(order, user)

    # Annulation : libérer le stock réservé
    if new_status == 'cancelled':
        _release_stock(order, user)
        order.cancelled_at = timezone.now()

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


def _reserve_stock(order: Order, user) -> None:
    """Crée un mouvement 'reservation' pour chaque ligne produit (skip services et lignes libres)."""
    if order.stock_reserved:
        return
    for item in order.items.select_related('variant__product').all():
        if item.variant and item.variant.product.type == 'product':
            StockMovement.objects.create(
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
    """Libère le stock réservé en cas d'annulation (skip services et lignes libres)."""
    if not order.stock_reserved:
        return
    for item in order.items.select_related('variant__product').all():
        if item.variant and item.variant.product.type == 'product':
            StockMovement.objects.create(
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
        order.save(update_fields=['amount_paid', 'payment_status', 'updated_by', 'updated_at'])
    else:
        order.save(update_fields=['amount_paid', 'payment_status', 'updated_at'])

    # Propager le statut de paiement à la facture liée (si elle existe et n'est pas annulée).
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


