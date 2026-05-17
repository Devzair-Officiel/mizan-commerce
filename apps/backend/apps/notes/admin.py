from django.contrib import admin
from .models import Note, Reminder


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ('shop', 'author', 'customer', 'order', 'created_at')
    list_filter = ('shop',)
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(Reminder)
class ReminderAdmin(admin.ModelAdmin):
    list_display = ('title', 'shop', 'category', 'status', 'due_at', 'author')
    list_filter = ('status', 'category', 'shop')
    search_fields = ('title',)
    readonly_fields = ('id', 'done_at', 'created_at', 'updated_at')
