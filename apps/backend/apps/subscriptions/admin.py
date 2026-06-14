from django.contrib import admin

from .models import Subscription, SubscriptionPlan


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'price_amount', 'currency', 'billing_period', 'is_active')
    list_filter = ('is_active', 'billing_period', 'currency')
    search_fields = ('code', 'name')
    ordering = ('price_amount',)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('shop', 'plan', 'status', 'current_period_end', 'cancel_at_period_end')
    list_filter = ('status', 'plan__code', 'cancel_at_period_end')
    search_fields = ('shop__name', 'stripe_subscription_id', 'stripe_customer_id')
    autocomplete_fields = ('shop', 'plan')
    readonly_fields = ('created_at', 'updated_at')
