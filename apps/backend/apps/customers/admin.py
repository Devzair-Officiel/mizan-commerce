from django.contrib import admin
from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'email', 'city', 'shop', 'is_active', 'created_at')
    list_filter = ('is_active', 'shop')
    search_fields = ('name', 'phone', 'email')
    readonly_fields = ('id', 'created_at', 'updated_at')
