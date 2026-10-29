from datetime import datetime, timedelta

from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ACTION_CHECKBOX_NAME
from django.db.models import QuerySet
from django.http import HttpRequest
from django.template.response import TemplateResponse
from django.utils import timezone

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import StripeEvent, Subscription, SubscriptionPlan
from .services import (
    STRIPE_MANAGED_MESSAGE,
    PlanAssignmentError,
    set_plan_manually,
)


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule : formules définies par `seed_plans`, prix synchronisés avec
    Stripe par `stripe_sync_plans`."""

    list_display = (
        'code',
        'name',
        'price_amount',
        'currency',
        'billing_period',
        'is_active',
    )
    list_filter = ('is_active', 'billing_period', 'currency')
    search_fields = ('code', 'name')
    ordering = ('price_amount',)
    readonly_fields = ('id', 'created_at', 'updated_at')


class AssignmentEndFilter(admin.SimpleListFilter):
    title = 'fin de la formule attribuée'
    parameter_name = 'assignment_end'

    def lookups(
        self, request: HttpRequest, model_admin: admin.ModelAdmin
    ) -> tuple[tuple[str, str], ...]:
        return (('7d', 'Se termine sous 7 jours'),)

    def queryset(
        self, request: HttpRequest, queryset: QuerySet[Subscription]
    ) -> QuerySet[Subscription]:
        if self.value() != '7d':
            return queryset
        now = timezone.now()
        # Même définition que `Subscription.assignment_ends_at`.
        return queryset.filter(
            status=Subscription.STATUS_ACTIVE,
            stripe_subscription_id='',
            current_period_end__gt=now,
            current_period_end__lte=now + timedelta(days=7),
        )


class ChangePlanForm(forms.Form):
    plan = forms.ModelChoiceField(
        label='Formule',
        queryset=SubscriptionPlan.objects.filter(is_active=True),
        to_field_name='code',
    )
    until = forms.DateField(
        label='Date de fin',
        required=False,
        widget=forms.DateInput(attrs={'type': 'date'}),
        help_text="Facultative. Jour compris : la formule court jusqu'à la fin de "
        "cette journée dans le fuseau de la boutique, puis retour sur Découverte "
        "(sans message au commerçant). Vide : sans fin.",
    )
    reason = forms.CharField(
        label='Motif',
        max_length=500,
        widget=forms.Textarea(attrs={'rows': 3}),
        help_text="Obligatoire, conservé dans le journal d'audit. Pas de donnée "
        "personnelle : ni nom, ni e-mail, ni téléphone.",
    )


@admin.register(Subscription)
class SubscriptionAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule. Seule écriture : l'action « Changer la formule », réservée
    aux abonnements sans lien Stripe (Stripe fait foi pour les autres : webhooks et
    réconciliation quotidienne)."""

    list_display = (
        'shop',
        'plan',
        'status',
        'current_period_end',
        'assignment_end',
        'cancel_at_period_end',
    )
    list_filter = ('status', 'plan__code', AssignmentEndFilter, 'cancel_at_period_end')
    search_fields = ('shop__name', 'stripe_subscription_id', 'stripe_customer_id')
    readonly_fields = ('id', 'created_at', 'updated_at')
    actions = ('change_plan',)

    @admin.display(description='Fin de la formule attribuée')
    def assignment_end(self, obj: Subscription) -> datetime | None:
        return obj.assignment_ends_at

    def has_assign_plan_permission(self, request: HttpRequest) -> bool:
        return bool(request.user.is_active and request.user.is_superuser)

    @admin.action(description='Changer la formule', permissions=('assign_plan',))
    def change_plan(
        self, request: HttpRequest, queryset: QuerySet[Subscription]
    ) -> TemplateResponse | None:
        if queryset.count() != 1:
            self.message_user(
                request, 'Sélectionnez un seul abonnement.', messages.WARNING
            )
            return None
        subscription = queryset.select_related('shop', 'plan').get()
        if subscription.stripe_subscription_id:
            self.message_user(request, STRIPE_MANAGED_MESSAGE, messages.ERROR)
            return None
        form = ChangePlanForm(request.POST if 'apply' in request.POST else None)
        if form.is_valid() and self._apply_plan(request, subscription, form):
            return None
        context = {
            **self.admin_site.each_context(request),
            'title': 'Changer la formule',
            'opts': self.model._meta,
            'subscription': subscription,
            'form': form,
            'action_checkbox_name': ACTION_CHECKBOX_NAME,
        }
        return TemplateResponse(
            request, 'admin/subscriptions/subscription/change_plan.html', context
        )

    def _apply_plan(
        self, request: HttpRequest, subscription: Subscription, form: ChangePlanForm
    ) -> bool:
        data = form.cleaned_data
        try:
            set_plan_manually(
                subscription,
                data['plan'].code,
                until=data['until'],
                reason=data['reason'],
                actor=request.user,
            )
        except PlanAssignmentError as exc:
            form.add_error(None, str(exc))
            return False
        self.message_user(
            request,
            f"Formule {data['plan'].name} attribuée à {subscription.shop}.",
            messages.SUCCESS,
        )
        return True


@admin.register(StripeEvent)
class StripeEventAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'event_type',
        'stripe_created_at',
        'received_at',
        'processed_at',
    )
    list_filter = ('event_type',)
    search_fields = ('id', 'event_type')
    readonly_fields = ('received_at',)
