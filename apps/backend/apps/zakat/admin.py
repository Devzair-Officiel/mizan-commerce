from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import ZakatCalculation, ZakatProfile, ZakatReceivableFollowUp

# Zakat : données personnelles et religieuses. Métadonnées seules (boutique,
# compte, année, dates, versée ou non) ; aucun montant, aucune ligne, aucun choix
# de méthode. Listes de champs fermées.


@admin.register(ZakatCalculation)
class ZakatCalculationAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'shop',
        'user',
        'hawl_year',
        'reference_date',
        'paid_on',
        'updated_at',
    )
    list_filter = ('shop',)
    fields = (
        'id',
        'shop',
        'user',
        'version',
        'current_step',
        'hawl_calendar',
        'hawl_year',
        'reference_date',
        'paid_on',
        'created_at',
        'updated_at',
    )
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(ZakatProfile)
class ZakatProfileAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('shop', 'user', 'calendar', 'updated_at')
    fields = (
        'id',
        'shop',
        'user',
        'calendar',
        'reminder_email_enabled',
        'created_at',
        'updated_at',
    )
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(ZakatReceivableFollowUp)
class ZakatReceivableFollowUpAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('shop', 'user', 'calculation', 'collected_on', 'updated_at')
    list_filter = ('shop',)
    fields = (
        'id',
        'shop',
        'user',
        'calculation',
        'line_id',
        'collected_on',
        'last_paid_at',
        'ignored_at',
        'created_at',
        'updated_at',
    )
    readonly_fields = ('id', 'created_at', 'updated_at')
