"""Helpers réutilisables par les tests des autres apps.

Depuis que `HasPlanForFeature` gate les endpoints (orders/invoices/zakat/…),
toute classe `TestCase` qui frappe ces vues doit attribuer une souscription au
shop de test, sinon `effective_plan` retombe sur Découverte (free) → 403.

Usage type dans un setUp :

    from apps.subscriptions.test_utils import attach_subscription
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_SOLO)
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .models import Subscription, SubscriptionPlan


def attach_subscription(shop, plan_code: str = SubscriptionPlan.CODE_SOLO) -> Subscription:  # noqa: E501
    """Attache une souscription `active` au shop pour les tests.

    Idempotent : si le shop a déjà une souscription, on la met à jour.
    """
    plan = SubscriptionPlan.objects.get(code=plan_code)
    sub, _ = Subscription.objects.update_or_create(
        shop=shop,
        defaults={
            'plan': plan,
            'status': Subscription.STATUS_ACTIVE,
            'current_period_start': timezone.now(),
            'current_period_end': None,
        },
    )
    return sub


def attach_trial(shop) -> Subscription:
    """Attache un essai Boutique en cours (14 jours restants) au shop."""
    sub = attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    sub.status = Subscription.STATUS_TRIALING
    sub.current_period_end = timezone.now() + timedelta(days=14)
    sub.save(update_fields=['status', 'current_period_end'])
    return sub
