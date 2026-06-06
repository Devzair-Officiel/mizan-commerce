"""Préparation de messages WhatsApp côté serveur.

L'envoi n'est jamais automatique : le service rend le texte à partir d'un contexte
(commande, client, produit, libre), stocke un `PreparedMessage`, et le commerçant
ouvre WhatsApp via wa.me pour envoyer manuellement.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import transaction

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.products.models import Product

from .models import PreparedMessage

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.shops.models import Shop


def _first_name(full_name: str) -> str:
    return (full_name or '').strip().split()[0] if full_name else ''


def _greeting(customer: Customer | None) -> str:
    first = _first_name(customer.name) if customer else ''
    return f'Bonjour {first},' if first else 'Bonjour,'


def _money(amount: Decimal, currency: str) -> str:
    return f'{amount:.2f} {currency}'


def render_template(
    *,
    template_type: str,
    shop: Shop,
    customer: Customer | None = None,
    order: Order | None = None,
    product: Product | None = None,
    free_message: str | None = None,
) -> str:
    """Rend le texte d'un message à partir d'un template et de son contexte.

    Lève `ValueError` si le contexte requis pour le template est manquant.
    """
    if template_type == PreparedMessage.TemplateType.FREE:
        if not free_message or not free_message.strip():
            raise ValueError('Message libre : le contenu est requis.')
        return free_message.strip()

    greeting = _greeting(customer)
    signoff = f'\n\nMerci,\n{shop.name}'

    if template_type == PreparedMessage.TemplateType.ORDER_CONFIRMATION:
        if order is None:
            raise ValueError('Confirmation de commande : commande introuvable.')
        return (
            f'{greeting}\n\n'
            f'Votre commande {order.order_number} a bien été enregistrée. '
            f'Total : {_money(order.total_amount, shop.currency)}.\n\n'
            f'Nous vous tiendrons informé(e) dès qu\'elle sera prête.'
            f'{signoff}'
        )

    if template_type == PreparedMessage.TemplateType.TRACKING:
        if order is None:
            raise ValueError('Suivi de colis : commande introuvable.')
        return (
            f'{greeting}\n\n'
            f'Votre commande {order.order_number} est en route. '
            f'Nous vous informerons dès que possible de son arrivée.'
            f'{signoff}'
        )

    if template_type == PreparedMessage.TemplateType.UNPAID_FOLLOWUP:
        if order is None:
            raise ValueError('Relance impayé : commande introuvable.')
        remaining = Decimal(order.total_amount) - Decimal(order.amount_paid)
        return (
            f'{greeting}\n\n'
            f'Un petit rappel concernant le solde de '
            f'{_money(remaining, shop.currency)} sur votre commande '
            f'{order.order_number}. Merci de nous tenir informés.'
            f'{signoff}'
        )

    if template_type == PreparedMessage.TemplateType.PROMO:
        product_line = (
            f' Découvrez : {product.name}.' if product else ''
        )
        return (
            f'{greeting}\n\n'
            f'Nous avons une nouvelle offre qui pourrait vous intéresser.'
            f'{product_line}\n\nN\'hésitez pas à venir voir !'
            f'{signoff}'
        )

    raise ValueError(f'Template inconnu : {template_type}')


@transaction.atomic
def prepare_message(
    *,
    shop: Shop,
    user: User,
    template_type: str,
    context_type: str = PreparedMessage.ContextType.NONE,
    context_id=None,
    customer: Customer | None = None,
    custom_message: str | None = None,
) -> PreparedMessage:
    """Crée un `PreparedMessage` pour la boutique.

    - Résout le contexte (commande / client / produit) en vérifiant l'appartenance
      à la boutique. Toute tentative cross-tenant est traitée comme un 404 métier.
    - Si `custom_message` est fourni, il prime sur le template rendu.
    - Pour `template_type=free`, `custom_message` est obligatoire.
    """
    order: Order | None = None
    product: Product | None = None

    if context_type == PreparedMessage.ContextType.ORDER and context_id:
        order = Order.objects.filter(shop=shop, id=context_id).select_related('customer').first()
        if order is None:
            raise ValueError('Commande introuvable.')
        if customer is None:
            customer = order.customer
    elif context_type == PreparedMessage.ContextType.PRODUCT and context_id:
        product = Product.objects.filter(shop=shop, id=context_id).first()
        if product is None:
            raise ValueError('Produit introuvable.')
    elif context_type == PreparedMessage.ContextType.CUSTOMER and context_id and customer is None:
        customer = Customer.objects.filter(shop=shop, id=context_id).first()
        if customer is None:
            raise ValueError('Client introuvable.')

    if customer is not None and customer.shop_id != shop.id:
        raise ValueError('Client introuvable.')

    if custom_message and custom_message.strip():
        message = custom_message.strip()
    else:
        message = render_template(
            template_type=template_type,
            shop=shop,
            customer=customer,
            order=order,
            product=product,
            free_message=custom_message,
        )

    return PreparedMessage.objects.create(
        shop=shop,
        customer=customer,
        template_type=template_type,
        context_type=context_type,
        context_id=context_id,
        recipient_name=customer.name if customer else '',
        recipient_phone=customer.phone if customer else '',
        message=message,
    )
