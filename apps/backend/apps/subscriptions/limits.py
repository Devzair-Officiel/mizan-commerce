"""Limites quantitatives liées au plan souscrit.

Complète `HasPlanForFeature` (gating qualitatif des features) avec un gating
*quantitatif* : produits actifs, commandes du mois, clients, membres.

Les limites elles-mêmes sont déclarées sur le modèle `SubscriptionPlan`
(`max_products`, `max_orders_per_month`, `max_customers`, `max_members`). Un
champ `NULL` veut dire illimité.

Convention :
- On ne lit pas directement le plan souscrit, on lit `shop.effective_plan`
  pour que les trials expirés non encore réconciliés soient bien gatés.
- On lève une `ValidationError` DRF (et pas une exception métier custom) pour
  que la couche HTTP traduise automatiquement en 400 avec le bon message
  côté client, sans try/except verbeux dans chaque vue.
- Atomicité : quand une limite s'applique, la ligne `shops` est verrouillée
  (`select_for_update`) avant de compter. Deux créations simultanées dans la
  même boutique passent l'une après l'autre : la seconde compte la première.
  Chaque `enforce_*` s'appelle donc **dans la transaction qui crée l'objet**
  (Django refuse `select_for_update` hors transaction).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone
from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from apps.shops.models import Shop
    from apps.subscriptions.models import SubscriptionPlan


def _lock_shop(shop: 'Shop') -> None:
    """Sérialise les créations soumises à une limite, boutique par boutique."""
    from apps.shops.models import Shop
    Shop.objects.select_for_update().only('pk').get(pk=shop.pk)


def _check(
    plan: 'SubscriptionPlan', limit: int, count: int, feature: str, detail: str,
) -> None:
    if count >= limit:
        raise ValidationError({
            'detail': detail,
            'code': 'plan_limit_exceeded',
            'limit': limit,
            'current': count,
            'feature': feature,
        })


def enforce_product_limit(shop: 'Shop') -> None:
    """Vérifie que la boutique peut encore créer un produit.

    Compte les produits actifs uniquement : un produit désactivé n'occupe pas
    un slot, on ne pénalise pas les commerçants qui archivent leur catalogue.
    """
    plan = shop.effective_plan
    limit = plan.max_products
    if limit is None:
        return

    from apps.products.models import Product
    _lock_shop(shop)
    count = Product.objects.filter(shop=shop, is_active=True).count()
    _check(plan, limit, count, 'products', (
        f'Votre formule « {plan.name} » est limitée à {limit} produits actifs. '
        'Désactivez un produit existant ou passez à une formule supérieure.'
    ))


def enforce_orders_per_month_limit(shop: 'Shop') -> None:
    """Vérifie que la boutique peut encore créer une commande ce mois-ci.

    Compteur calendaire (1er du mois en heure locale du serveur). On
    n'exclut pas les commandes annulées : une commande créée puis annulée a
    quand même consommé un slot — sinon un user gratuit pourrait contourner
    la limite en créant/annulant en boucle.
    """
    plan = shop.effective_plan
    limit = plan.max_orders_per_month
    if limit is None:
        return

    from apps.orders.models import Order
    _lock_shop(shop)
    now = timezone.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = Order.objects.filter(shop=shop, created_at__gte=start_of_month).count()
    _check(plan, limit, count, 'orders', (
        f'Votre formule « {plan.name} » est limitée à {limit} commandes par mois. '
        'Passez à une formule supérieure pour en créer davantage.'
    ))


def enforce_customer_limit(shop: 'Shop') -> None:
    """Vérifie que la boutique peut encore créer un client.

    Comme pour les produits, seuls les clients actifs occupent un slot.
    """
    plan = shop.effective_plan
    limit = plan.max_customers
    if limit is None:
        return

    from apps.customers.models import Customer
    _lock_shop(shop)
    count = Customer.objects.filter(shop=shop, is_active=True).count()
    _check(plan, limit, count, 'customers', (
        f'Votre formule « {plan.name} » est limitée à {limit} clients actifs. '
        'Désactivez un client existant ou passez à une formule supérieure.'
    ))


def enforce_member_limit(shop: 'Shop') -> None:
    """Vérifie que la boutique peut encore ajouter un membre (propriétaire compris)."""
    plan = shop.effective_plan
    limit = plan.max_members
    if limit is None:
        return

    from apps.shops.models import ShopMember
    _lock_shop(shop)
    count = ShopMember.objects.filter(shop=shop).count()
    _check(plan, limit, count, 'members', (
        f'Votre formule « {plan.name} » est limitée à {limit} membres, '
        'propriétaire compris. Retirez un membre ou passez à une formule supérieure.'
    ))
