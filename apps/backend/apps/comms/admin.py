from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import MessageSettings, PreparedMessage


@admin.register(PreparedMessage)
class PreparedMessageAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'template_type',
        'status',
        'recipient_name',
        'recipient_phone',
        'shop',
        'created_at',
        'sent_manually_at',
    )
    list_filter = ('template_type', 'status', 'shop')
    search_fields = ('recipient_name', 'recipient_phone', 'message')
    readonly_fields = ('id', 'created_at', 'updated_at')
    autocomplete_fields = ('customer',)


@admin.register(MessageSettings)
class MessageSettingsAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('shop', 'tone', 'updated_at')
    list_filter = ('tone',)
    readonly_fields = ('id', 'created_at', 'updated_at')
