"""Limites quantitatives liées au plan souscrit.

Complète `HasPlanForFeature` (gating qualitatif des features) avec un gating
*quantitatif* : nombre de produits, de commandes par mois, etc.

Les limites elles-mêmes sont déclarées sur le modèle `SubscriptionPlan`
(champs `max_products`, `max_orders_per_month`). Un champ `NULL` veut dire
illimité.

Convention :
- On ne lit pas directement le plan souscrit, on lit `shop.effective_plan`
  pour que les trials expirés non encore réconciliés soient bien gatés.
- On lève une `ValidationError` DRF (et pas une exception métier custom) pour
  que la couche HTTP traduise automatiquement en 400 avec le bon message
  côté client, sans try/except verbeux dans chaque vue.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone
from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from apps.shops.models import Shop


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
    count = Product.objects.filter(shop=shop, is_active=True).count()
    if count >= limit:
        raise ValidationError({
            'detail': (
                f'Votre formule « {plan.name} » est limitée à {limit} produits actifs. '
                'Désactivez un produit existant ou passez à une formule supérieure.'
            ),
            'code': 'plan_limit_exceeded',
            'limit': limit,
            'current': count,
            'feature': 'products',
        })


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
    now = timezone.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = Order.objects.filter(shop=shop, created_at__gte=start_of_month).count()
    if count >= limit:
        raise ValidationError({
            'detail': (
                f'Votre formule « {plan.name} » est limitée à {limit} commandes par mois. '
                'Passez à une formule supérieure pour en créer davantage.'
            ),
            'code': 'plan_limit_exceeded',
            'limit': limit,
            'current': count,
            'feature': 'orders',
        })
