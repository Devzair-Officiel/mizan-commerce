"""Endpoints REST de gestion d'abonnement.

URS-100 — Permet au frontend d'afficher le plan courant (essai/payant/gratuit)
et au commerçant de résilier (downgrade vers Gratuit). Le passage à un plan
payant via cette API est volontairement bloqué : il passera par Stripe Checkout
quand la facturation sera branchée.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_shop

from .models import Subscription
from .serializers import SubscriptionChangeSerializer, SubscriptionSerializer
from .services import downgrade_to_free


def _get_subscription(user) -> Subscription:
    """Charge l'abonnement de la boutique du user, avec le plan en select_related."""
    shop = get_shop(user)
    try:
        return Subscription.objects.select_related('plan', 'shop').get(shop=shop)
    except Subscription.DoesNotExist as exc:
        # Devrait être impossible : la souscription est créée à l'inscription
        # (start_trial_or_default). Un 404 ici signale un bug d'orchestration.
        raise NotFound("Aucun abonnement associé à votre boutique.") from exc


class SubscriptionCurrentView(APIView):
    """GET /api/subscriptions/current/ — abonnement courant de la boutique.

    Accessible à tout membre (un staff doit voir le plan effectif pour comprendre
    pourquoi un module est verrouillé). La résiliation reste admin-only.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request) -> Response:
        subscription = _get_subscription(request.user)
        return Response(SubscriptionSerializer(subscription).data)


class SubscriptionChangeView(APIView):
    """POST /api/subscriptions/change/ — change le plan (downgrade Gratuit seul).

    Admin only : un staff ne peut pas résilier la boutique sous ses pieds.
    """

    permission_classes = (IsAuthenticated, IsShopAdmin)

    def post(self, request) -> Response:
        serializer = SubscriptionChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription = _get_subscription(request.user)
        subscription = downgrade_to_free(subscription)
        return Response(
            SubscriptionSerializer(subscription).data,
            status=status.HTTP_200_OK,
        )
