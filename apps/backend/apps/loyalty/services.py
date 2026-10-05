from __future__ import annotations

from django.db import transaction
from django.db.models import F

from apps.customers.models import Customer
from apps.shops.models import Shop

from .models import LoyaltyCard, LoyaltyProgram, LoyaltyTransaction


def get_or_create_program(shop: Shop) -> LoyaltyProgram:
    program, _ = LoyaltyProgram.objects.get_or_create(shop=shop)
    return program


def get_or_create_card(shop: Shop, customer: Customer) -> LoyaltyCard:
    card, _ = LoyaltyCard.objects.get_or_create(shop=shop, customer=customer)
    return card


@transaction.atomic
def earn_points(
    card: LoyaltyCard,
    points: int,
    *,
    order: object | None = None,
    created_by: object | None = None,
    note: str = '',
) -> LoyaltyTransaction:
    if points <= 0:
        raise ValueError('Le nombre de points à accorder doit être positif.')
    LoyaltyCard.objects.filter(pk=card.pk).update(
        points_balance=F('points_balance') + points,
        total_points_earned=F('total_points_earned') + points,
    )
    return LoyaltyTransaction.objects.create(
        shop=card.shop,
        card=card,
        transaction_type=LoyaltyTransaction.TYPE_EARN,
        points=points,
        order=order,
        created_by=created_by,
        note=note,
    )


@transaction.atomic
def redeem_points(
    card: LoyaltyCard,
    points: int,
    *,
    order: object | None = None,
    created_by: object | None = None,
) -> LoyaltyTransaction:
    if points <= 0:
        raise ValueError('Le nombre de points à rembourser doit être positif.')
    updated = LoyaltyCard.objects.filter(
        pk=card.pk, points_balance__gte=points,
    ).update(
        points_balance=F('points_balance') - points,
        total_points_redeemed=F('total_points_redeemed') + points,
    )
    if updated == 0:
        raise ValueError('Solde de points insuffisant.')
    return LoyaltyTransaction.objects.create(
        shop=card.shop,
        card=card,
        transaction_type=LoyaltyTransaction.TYPE_REDEEM,
        points=-points,
        order=order,
        created_by=created_by,
    )


@transaction.atomic
def adjust_points(
    card: LoyaltyCard,
    delta: int,
    *,
    created_by: object,
    note: str,
) -> LoyaltyTransaction:
    if delta == 0:
        raise ValueError('Le delta ne peut pas être nul.')
    qs = LoyaltyCard.objects.filter(pk=card.pk)
    if delta < 0:
        qs = qs.filter(points_balance__gte=-delta)
    updated = qs.update(points_balance=F('points_balance') + delta)
    if updated == 0:
        raise ValueError("L'ajustement entraînerait un solde négatif.")
    return LoyaltyTransaction.objects.create(
        shop=card.shop,
        card=card,
        transaction_type=LoyaltyTransaction.TYPE_ADJUST,
        points=delta,
        created_by=created_by,
        note=note,
    )
