from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.products.models import Product
from apps.stock.models import StockMovement
from .models import Order, OrderItem

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
def create_order(shop, user, customer=None, notes='', discount=Decimal('0'), shipping=Decimal('0')) -> Order:
    order = Order.objects.create(
        shop=shop,
        customer=customer,
        order_number=generate_order_number(shop),
        notes=notes,
        discount_amount=discount,
        shipping_amount=shipping,
        created_by=user,
    )
    return order


@transaction.atomic
def add_item(order: Order, product: Product, quantity: int, unit_price: Decimal = None) -> OrderItem:
    if order.status != 'draft':
        raise ValueError("Impossible d'ajouter un article à une commande qui n'est plus en brouillon.")

    price = unit_price if unit_price is not None else product.selling_price
    item = OrderItem.objects.create(
        shop=order.shop,
        order=order,
        product=product,
        product_name=product.name,
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
    order.save(update_fields=['status', 'cancelled_at', 'updated_at'])
    return order


def _reserve_stock(order: Order, user) -> None:
    """Crée un mouvement 'reservation' pour chaque ligne de la commande."""
    if order.stock_reserved:
        return
    for item in order.items.select_related('product').all():
        if item.product:
            StockMovement.objects.create(
                shop=order.shop,
                product=item.product,
                movement_type='reservation',
                quantity=item.quantity,
                reason=f'Réservation commande {order.order_number}',
                order_id=order.id,
                created_by=user,
            )
    order.stock_reserved = True
    order.save(update_fields=['stock_reserved', 'updated_at'])


def _release_stock(order: Order, user) -> None:
    """Libère le stock réservé en cas d'annulation."""
    if not order.stock_reserved:
        return
    for item in order.items.select_related('product').all():
        if item.product:
            StockMovement.objects.create(
                shop=order.shop,
                product=item.product,
                movement_type='release',
                quantity=item.quantity,
                reason=f'Annulation commande {order.order_number}',
                order_id=order.id,
                created_by=user,
            )
    order.stock_reserved = False
    order.save(update_fields=['stock_reserved', 'updated_at'])


@transaction.atomic
def update_payment(order: Order, amount_paid: Decimal) -> Order:
    order.amount_paid = amount_paid
    if amount_paid <= 0:
        order.payment_status = 'unpaid'
    elif amount_paid < order.total_amount:
        order.payment_status = 'partial'
    else:
        order.payment_status = 'paid'
    order.save(update_fields=['amount_paid', 'payment_status', 'updated_at'])
    return order
