from datetime import timedelta
from typing import Any

from django.conf import settings
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.core.permissions import get_member
from apps.shops.models import ShopMember

from .limits import UsageCounter, ai_reads_usage, shop_usage
from .models import Subscription, SubscriptionPlan
from .services import PAST_DUE_GRACE_DAYS
from .stripe_client import billing_enabled

PAID_PLANS = SubscriptionPlan.TIER_ORDER[1:]
INTERVALS = (SubscriptionPlan.PERIOD_MONTH, SubscriptionPlan.PERIOD_YEAR)


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = (
            'id', 'code', 'name', 'description',
            'price_amount', 'price_yearly_amount', 'currency', 'billing_period',
            'max_products', 'max_orders_per_month', 'max_customers', 'max_members',
            'max_text_scans_per_month', 'features_json', 'is_active',
        )
        read_only_fields = fields


class SubscriptionSerializer(serializers.ModelSerializer):
    """Vue lecture seule de l'abonnement courant d'une boutique.

    Expose `effective_plan_code` pour que le frontend gate la UI exactement
    comme le backend : un trial expiré apparaît déjà sur 'free' côté lazy,
    même si la tâche Celery n'a pas encore réconcilié la DB.

    Facturation : aucun identifiant Stripe n'est exposé, seulement des booléens
    (`stripe_managed`, `has_billing_customer`). `can_manage` lit le rôle du
    membre dans le contexte (`request`) : faux sans requête.
    """

    plan = SubscriptionPlanSerializer(read_only=True)
    effective_plan_code = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()
    usage = serializers.SerializerMethodField()
    ai_reads_enabled = serializers.SerializerMethodField()
    ai_reads = serializers.SerializerMethodField()
    grace_ends_at = serializers.SerializerMethodField()
    trial_ends_at = serializers.SerializerMethodField()
    stripe_managed = serializers.SerializerMethodField()
    has_billing_customer = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    billing_enabled = serializers.SerializerMethodField()
    scheduled_change = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            'id', 'plan', 'status',
            'current_period_start', 'current_period_end',
            'cancel_at_period_end', 'cancelled_at',
            'is_trial_expired',
            'effective_plan_code',
            'days_remaining',
            'usage',
            'ai_reads_enabled', 'ai_reads',
            'billing_interval', 'past_due_since', 'grace_ends_at',
            'trial_ends_at',
            'stripe_managed', 'has_billing_customer', 'can_manage', 'billing_enabled',
            'scheduled_change',
            'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_grace_ends_at(self, obj: Subscription) -> str | None:
        """Fin du délai laissé à un paiement en retard (null s'il n'y en a pas)."""
        if obj.past_due_since is None:
            return None
        grace_end = obj.past_due_since + timedelta(days=PAST_DUE_GRACE_DAYS)
        return serializers.DateTimeField().to_representation(grace_end)

    def get_trial_ends_at(self, obj: Subscription) -> str | None:
        """Fin de l'essai Mizan (null hors essai ou avec un abonnement Stripe)."""
        if obj.status != Subscription.STATUS_TRIALING or obj.stripe_subscription_id:
            return None
        if obj.current_period_end is None:
            return None
        return serializers.DateTimeField().to_representation(obj.current_period_end)

    def get_scheduled_change(self, obj: Subscription) -> dict[str, str | None] | None:
        """Changement de formule programmé en fin de période, null sans changement."""
        if not obj.scheduled_plan_code:
            return None
        return {
            'plan': obj.scheduled_plan_code,
            'interval': obj.scheduled_interval,
            'at': serializers.DateTimeField().to_representation(obj.scheduled_change_at)
            if obj.scheduled_change_at else None,
        }

    def get_stripe_managed(self, obj: Subscription) -> bool:
        return bool(obj.stripe_subscription_id)

    def get_has_billing_customer(self, obj: Subscription) -> bool:
        return bool(obj.stripe_customer_id)

    def get_can_manage(self, obj: Subscription) -> bool:
        """Seul le propriétaire souscrit, résilie ou ouvre le portail."""
        request = self.context.get('request')
        if request is None:
            return False
        try:
            return get_member(request.user).role == ShopMember.ROLE_OWNER
        except PermissionDenied:
            return False

    def get_billing_enabled(self, obj: Subscription) -> bool:
        return billing_enabled()

    def get_usage(self, obj: Subscription) -> dict[str, UsageCounter]:
        """Compteurs des jauges face aux limites de la formule effective."""
        return shop_usage(obj.shop)

    def get_ai_reads_enabled(self, obj: Subscription) -> bool:
        """Lectures avancées du scan en service (fournisseur IA configuré) : sinon
        jauge et ligne de formule sont masquées, rien n'est promis."""
        return settings.PRODUCT_SCAN_AI_ENABLED

    def get_ai_reads(self, obj: Subscription) -> UsageCounter | None:
        """Lectures avancées du mois face au plafond de la formule effective."""
        if not settings.PRODUCT_SCAN_AI_ENABLED:
            return None
        return ai_reads_usage(obj.shop)

    def get_effective_plan_code(self, obj: Subscription) -> str:
        return obj.shop.effective_plan.code

    def get_days_remaining(self, obj: Subscription) -> int | None:
        """Nombre de jours pleins restants avant la fin de la période courante.

        N'a de sens qu'en `trialing` ou si la souscription est `cancel_at_period_end`.
        Retourne `None` sinon (le frontend masque alors le compteur).
        """
        if not obj.current_period_end:
            return None
        if obj.status != Subscription.STATUS_TRIALING and not obj.cancel_at_period_end:
            return None
        from django.utils import timezone
        delta = obj.current_period_end - timezone.now()
        return max(delta.days, 0)


class SubscriptionChangeSerializer(serializers.Serializer):
    """Validation du POST /subscriptions/change/.

    - `plan_code` (lot 3a) : seul le retour sur `free` aboutit
      (`stripe_billing.change_plan`) ; une formule payante renvoie 400
      `use_checkout_or_change_plan`.
    - `plan` + `interval` : changement de formule d'un abonnement Stripe en cours
      (`stripe_plan_change.apply_plan_change`). `expected_amount` et
      `proration_date` recopient l'aperçu ; exigés pour une montée immédiate.
    """

    plan_code = serializers.ChoiceField(choices=SubscriptionPlan.TIER_ORDER, required=False)  # noqa: E501
    plan = serializers.ChoiceField(choices=PAID_PLANS, required=False)
    interval = serializers.ChoiceField(choices=INTERVALS, required=False)
    expected_amount = serializers.RegexField(r'^\d{1,10}\.\d{2}$', required=False)
    proration_date = serializers.IntegerField(min_value=0, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if ('plan_code' in attrs) == ('plan' in attrs):
            raise serializers.ValidationError('Indiquez soit plan_code, soit plan.')
        if 'plan' in attrs and 'interval' not in attrs:
            raise serializers.ValidationError({'interval': 'Ce champ est obligatoire.'})
        return attrs


class ChangePreviewSerializer(serializers.Serializer):
    """Validation du POST /subscriptions/change-preview/ : formule payante et rythme."""

    plan = serializers.ChoiceField(choices=PAID_PLANS)
    interval = serializers.ChoiceField(choices=INTERVALS)


class CheckoutSerializer(serializers.Serializer):
    """Validation du POST /subscriptions/checkout/ : formule payante et rythme."""

    plan = serializers.ChoiceField(choices=SubscriptionPlan.TIER_ORDER[1:])
    interval = serializers.ChoiceField(
        choices=(SubscriptionPlan.PERIOD_MONTH, SubscriptionPlan.PERIOD_YEAR),
    )
