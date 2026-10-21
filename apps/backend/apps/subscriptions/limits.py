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

from datetime import datetime
from typing import TYPE_CHECKING, TypedDict

from django.utils import timezone
from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from apps.customers.models import Customer
    from apps.products.models import Product
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


def _start_of_month() -> datetime:
    return timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def enforce_product_limit(shop: 'Shop', reactivating: 'Product | None' = None) -> None:
    """Vérifie que la boutique peut encore créer (ou réactiver) un produit.

    Compte les produits actifs uniquement : un produit désactivé n'occupe pas
    un slot, on ne pénalise pas les commerçants qui archivent leur catalogue.
    Réactiver reprend un slot : `reactivating` est exclu du compte, pour qu'une
    réactivation concurrente du même produit ne se compte pas elle-même.
    """
    plan = shop.effective_plan
    limit = plan.max_products
    if limit is None:
        return

    from apps.products.models import Product
    _lock_shop(shop)
    active = Product.objects.filter(shop=shop, is_active=True)
    if reactivating is not None:
        active = active.exclude(pk=reactivating.pk)
    _check(plan, limit, active.count(), 'products', (
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
    count = Order.objects.filter(shop=shop, created_at__gte=_start_of_month()).count()
    _check(plan, limit, count, 'orders', (
        f'Votre formule « {plan.name} » est limitée à {limit} commandes par mois. '
        'Passez à une formule supérieure pour en créer davantage.'
    ))


def enforce_customer_limit(
    shop: 'Shop', reactivating: 'Customer | None' = None,
) -> None:
    """Vérifie que la boutique peut encore créer (ou réactiver) un client.

    Comme pour les produits, seuls les clients actifs occupent un slot, et
    `reactivating` est exclu du compte.
    """
    plan = shop.effective_plan
    limit = plan.max_customers
    if limit is None:
        return

    from apps.customers.models import Customer
    _lock_shop(shop)
    active = Customer.objects.filter(shop=shop, is_active=True)
    if reactivating is not None:
        active = active.exclude(pk=reactivating.pk)
    _check(plan, limit, active.count(), 'customers', (
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


class UsageCounter(TypedDict):
    count: int
    limit: int | None


def shop_usage(shop: 'Shop') -> dict[str, UsageCounter]:
    """Usage de la boutique face aux limites de sa formule effective (jauges).

    Mêmes comptes que les `enforce_*` ci-dessus ; `limit` à `None` = illimité.
    Lecture seule, sans verrou : un instantané pour l'affichage.
    """
    from apps.customers.models import Customer
    from apps.orders.models import Order
    from apps.products.models import Product
    from apps.shops.models import ShopMember

    plan = shop.effective_plan
    return {
        'products': {
            'count': Product.objects.filter(shop=shop, is_active=True).count(),
            'limit': plan.max_products,
        },
        'orders_this_month': {
            'count': Order.objects.filter(shop=shop, created_at__gte=_start_of_month()).count(),  # noqa: E501
            'limit': plan.max_orders_per_month,
        },
        'customers': {
            'count': Customer.objects.filter(shop=shop, is_active=True).count(),
            'limit': plan.max_customers,
        },
        'members': {
            'count': ShopMember.objects.filter(shop=shop).count(),
            'limit': plan.max_members,
        },
    }


def ai_reads_usage(shop: 'Shop') -> UsageCounter:
    """Lectures avancées du mois (fuseau de la boutique) face au plafond de la
    formule effective — pas de Découverte : le compteur repart chaque mois."""
    from apps.ocr.models import ProductScanUsage
    from apps.ocr.services import scan_quota_month

    usage = ProductScanUsage.objects.filter(
        shop=shop, month=scan_quota_month(shop),
    ).values_list('text_count', flat=True).first()
    return {
        'count': usage or 0,
        'limit': shop.effective_plan.max_text_scans_per_month,
    }
