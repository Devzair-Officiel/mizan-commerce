from django.contrib import admin

from .models import PreparedMessage


@admin.register(PreparedMessage)
class PreparedMessageAdmin(admin.ModelAdmin):
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
