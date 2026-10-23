"""Endpoints REST de gestion d'abonnement.

URS-100 — Permet au frontend d'afficher le plan courant (essai/payant/gratuit)
et au commerçant de résilier (downgrade vers Découverte). Une formule payante se
souscrit par Stripe Checkout (`checkout/`), jamais par `change/`.

Facturation (lot 3a) : réservée au propriétaire, boutique tirée de
`get_shop(request.user)` uniquement ; la logique vit dans `stripe_billing`.
"""

from __future__ import annotations

from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.core.permissions import IsShopOwner, get_shop

from .models import Subscription, SubscriptionPlan
from .serializers import (
    CheckoutSerializer,
    SubscriptionChangeSerializer,
    SubscriptionPlanSerializer,
    SubscriptionSerializer,
)
from .stripe_billing import (
    cancel_subscription,
    change_plan,
    create_checkout_session,
    create_portal_session,
    refresh_subscription,
    resume_subscription,
)
from .throttles import (
    BillingCheckoutRateThrottle,
    BillingPortalRateThrottle,
    BillingRefreshRateThrottle,
)


def _get_subscription(user) -> Subscription:
    """Charge l'abonnement de la boutique du user, avec le plan en select_related."""
    shop = get_shop(user)
    try:
        return Subscription.objects.select_related('plan', 'shop').get(shop=shop)
    except Subscription.DoesNotExist as exc:
        # Devrait être impossible : la souscription est créée à l'inscription
        # (start_trial_or_default). Un 404 ici signale un bug d'orchestration.
        raise NotFound("Aucun abonnement associé à votre boutique.") from exc


def _subscription_response(subscription: Subscription, request) -> Response:
    serializer = SubscriptionSerializer(subscription, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


class SubscriptionCurrentView(APIView):
    """GET /api/subscriptions/current/ — abonnement courant de la boutique.

    Accessible à tout membre (un staff doit voir le plan effectif pour comprendre
    pourquoi un module est verrouillé). Les actions restent au propriétaire.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request) -> Response:
        return _subscription_response(_get_subscription(request.user), request)


class SubscriptionChangeView(APIView):
    """POST /api/subscriptions/change/ — retour sur Découverte seulement.

    Propriétaire seul. Un abonnement Stripe en cours est résilié chez Stripe
    (`cancel_subscription`) ; un essai ou une formule sans Stripe bascule tout
    de suite.
    """

    permission_classes = (IsAuthenticated, IsShopOwner)

    def post(self, request) -> Response:
        serializer = SubscriptionChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shop = get_shop(request.user)
        subscription = change_plan(shop, serializer.validated_data['plan_code'])
        return _subscription_response(subscription, request)


class SubscriptionCheckoutView(APIView):
    """POST /api/subscriptions/checkout/ — URL de la page de paiement Stripe."""

    permission_classes = (IsAuthenticated, IsShopOwner)
    throttle_classes = (UserRateThrottle, BillingCheckoutRateThrottle)

    def post(self, request) -> Response:
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        url = create_checkout_session(
            get_shop(request.user), request.user,
            serializer.validated_data['plan'], serializer.validated_data['interval'],
        )
        return Response({'url': url})


class SubscriptionPortalView(APIView):
    """POST /api/subscriptions/portal/ — URL du portail client Stripe."""

    permission_classes = (IsAuthenticated, IsShopOwner)
    throttle_classes = (UserRateThrottle, BillingPortalRateThrottle)

    def post(self, request) -> Response:
        return Response({'url': create_portal_session(get_shop(request.user))})


class SubscriptionCancelView(APIView):
    """POST /api/subscriptions/cancel/ — résiliation de l'abonnement Stripe."""

    permission_classes = (IsAuthenticated, IsShopOwner)

    def post(self, request) -> Response:
        subscription = cancel_subscription(get_shop(request.user))
        return _subscription_response(subscription, request)


class SubscriptionResumeView(APIView):
    """POST /api/subscriptions/resume/ — annule la résiliation programmée."""

    permission_classes = (IsAuthenticated, IsShopOwner)

    def post(self, request) -> Response:
        subscription = resume_subscription(get_shop(request.user))
        return _subscription_response(subscription, request)


class SubscriptionRefreshView(APIView):
    """POST /api/subscriptions/refresh/ — resynchronise depuis Stripe."""

    permission_classes = (IsAuthenticated, IsShopOwner)
    throttle_classes = (UserRateThrottle, BillingRefreshRateThrottle)

    def post(self, request) -> Response:
        subscription = refresh_subscription(get_shop(request.user))
        return _subscription_response(subscription, request)


class SubscriptionPlanListView(generics.ListAPIView):
    """GET /api/subscriptions/plans/ — grille des formules actives.

    Catalogue de la plateforme, commun à toutes les boutiques (pas de `shop_id`) :
    la page Abonnement y lit les prix plutôt que de les coder en dur.
    """

    permission_classes = (IsAuthenticated,)
    serializer_class = SubscriptionPlanSerializer
    pagination_class = None
    queryset = SubscriptionPlan.objects.filter(is_active=True).order_by('price_amount')
