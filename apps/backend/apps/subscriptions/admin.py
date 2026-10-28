from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import StripeEvent, Subscription, SubscriptionPlan


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule : formules définies par `seed_plans`, prix synchronisés avec
    Stripe par `stripe_sync_plans`."""

    list_display = (
        "code",
        "name",
        "price_amount",
        "currency",
        "billing_period",
        "is_active",
    )
    list_filter = ("is_active", "billing_period", "currency")
    search_fields = ("code", "name")
    ordering = ("price_amount",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Subscription)
class SubscriptionAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule : Stripe fait foi (webhooks et réconciliation quotidienne)."""

    list_display = (
        "shop",
        "plan",
        "status",
        "current_period_end",
        "cancel_at_period_end",
    )
    list_filter = ("status", "plan__code", "cancel_at_period_end")
    search_fields = ("shop__name", "stripe_subscription_id", "stripe_customer_id")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(StripeEvent)
class StripeEventAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "event_type",
        "stripe_created_at",
        "received_at",
        "processed_at",
    )
    list_filter = ("event_type",)
    search_fields = ("id", "event_type")
    readonly_fields = ("received_at",)
