from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin
from .models import Note, Reminder, ReminderSettings


@admin.register(Note)
class NoteAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('shop', 'author', 'customer', 'order', 'created_at')
    list_filter = ('shop',)
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(Reminder)
class ReminderAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'title',
        'shop',
        'category',
        'status',
        'due_at',
        'assigned_to',
        'is_automatic',
    )
    list_filter = ('status', 'category', 'is_automatic', 'shop')
    search_fields = ('title',)
    readonly_fields = ('id', 'done_at', 'created_at', 'updated_at')


@admin.register(ReminderSettings)
class ReminderSettingsAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'shop',
        'unpaid_followup_enabled',
        'pending_orders_enabled',
        'daily_summary_enabled',
    )
    readonly_fields = ('daily_summary_sent_on', 'updated_at')
