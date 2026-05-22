from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'full_name', 'phone', 'is_active', 'is_staff', 'email_verified_at', 'created_at')
    list_filter = ('is_active', 'is_staff', 'is_superuser')
    search_fields = ('email', 'full_name', 'phone')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'last_login', 'created_at', 'updated_at')

    fieldsets = (
        (None, {'fields': ('id', 'email', 'password')}),
        ('Informations', {'fields': ('full_name', 'phone', 'email_verified_at')}),
        ('Droits', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('last_login', 'created_at', 'updated_at')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'full_name', 'password1', 'password2'),
        }),
    )

    # Le UserAdmin de base utilise username — on remplace par email
    filter_horizontal = ('groups', 'user_permissions')
