from rest_framework import serializers

from .models import Subscription, SubscriptionPlan


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = (
            'id', 'code', 'name', 'description',
            'price_amount', 'currency', 'billing_period',
            'max_products', 'max_orders_per_month',
            'features_json', 'is_active',
        )
        read_only_fields = fields


class SubscriptionSerializer(serializers.ModelSerializer):
    """Vue lecture seule de l'abonnement courant d'une boutique.

    Expose `effective_plan_code` pour que le frontend gate la UI exactement
    comme le backend : un trial expiré apparaît déjà sur 'free' côté lazy,
    même si la tâche Celery n'a pas encore réconcilié la DB.
    """

    plan = SubscriptionPlanSerializer(read_only=True)
    effective_plan_code = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            'id', 'plan', 'status',
            'current_period_start', 'current_period_end',
            'cancel_at_period_end', 'cancelled_at',
            'is_trial_expired',
            'effective_plan_code',
            'days_remaining',
            'created_at', 'updated_at',
        )
        read_only_fields = fields

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

    Tant que Stripe n'est pas branché, seul un **downgrade vers `free`** est
    autorisé (résiliation manuelle de l'essai ou du plan payant). Tout autre
    changement renvoie 400 — pas question d'offrir Pro ou Boutique+
    gratuitement par cet endpoint.
    """

    plan_code = serializers.ChoiceField(
        choices=[
            SubscriptionPlan.CODE_FREE,
            SubscriptionPlan.CODE_PRO,
            SubscriptionPlan.CODE_BOUTIQUE_PLUS,
        ],
    )

    def validate_plan_code(self, value: str) -> str:
        if value != SubscriptionPlan.CODE_FREE:
            raise serializers.ValidationError(
                "Le passage à une formule payante via API n'est pas encore "
                "disponible — la facturation arrive avec l'intégration Stripe.",
            )
        return value
