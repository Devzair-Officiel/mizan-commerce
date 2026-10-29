"""Enregistrements de l'admin interne hors apps métier : journal d'audit, paquets tiers.

Le module est importé après ceux d'auth, d'axes et de token_blacklist (ordre
d'INSTALLED_APPS) : leurs enregistrements existent déjà et peuvent être retirés.
"""

from django.contrib import admin
from django.contrib.auth.models import Group
from django.http import HttpRequest
from axes import admin as axes_admin
from axes.models import AccessAttempt, AccessFailureLog, AccessLog
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from .admin_site import ReadOnlyAdminMixin
from .models import AuditLog

# Group : inutile, l'accès est réservé aux superusers (sans permissions fines).
# Jetons : la fiche d'OutstandingToken affiche le jeton de rafraîchissement en
# clair. Une révocation passe par `accounts.services.revoke_refresh_tokens`.
for model in (Group, OutstandingToken, BlacklistedToken):
    if admin.site.is_registered(model):
        admin.site.unregister(model)


@admin.register(AuditLog)
class AuditLogAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'created_at',
        'action',
        'model_name',
        'object_repr',
        'user',
        'shop_id',
    )
    list_filter = ('action', 'model_name')
    search_fields = ('object_id', 'object_repr', 'shop_id')
    readonly_fields = ('id', 'created_at')


class AccessAttemptAdmin(ReadOnlyAdminMixin, axes_admin.AccessAttemptAdmin):
    """Blocages en cours. Suppression autorisée : lève le blocage du couple
    (compte, adresse), comme `axes_reset_username`. Données de formulaire masquées."""

    fieldsets = (
        (
            None,
            {
                'fields': (
                    'username',
                    'path_info',
                    'failures_since_start',
                    'attempt_time',
                )
            },
        ),
        ('Métadonnées', {'fields': ('user_agent', 'ip_address', 'http_accept')}),
    )
    readonly_fields = ('attempt_time',)

    def has_delete_permission(
        self, request: HttpRequest, obj: AccessAttempt | None = None
    ) -> bool:
        return True


class AccessLogAdmin(ReadOnlyAdminMixin, axes_admin.AccessLogAdmin):
    readonly_fields = ('attempt_time',)


class AccessFailureLogAdmin(ReadOnlyAdminMixin, axes_admin.AccessFailureLogAdmin):
    readonly_fields = ('attempt_time',)


for model, model_admin in (
    (AccessAttempt, AccessAttemptAdmin),
    (AccessLog, AccessLogAdmin),
    (AccessFailureLog, AccessFailureLogAdmin),
):
    if admin.site.is_registered(model):
        admin.site.unregister(model)
    admin.site.register(model, model_admin)
