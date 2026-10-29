from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin
from .models import LoyaltyCard, LoyaltyProgram, LoyaltyTransaction


@admin.register(LoyaltyProgram)
class LoyaltyProgramAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'shop',
        'is_active',
        'points_per_unit',
        'redemption_threshold',
        'redemption_value',
        'updated_at',
    )
    list_filter = ('is_active',)
    readonly_fields = ('created_at', 'updated_at')


class LoyaltyTransactionInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = LoyaltyTransaction
    extra = 0
    readonly_fields = (
        'id',
        'transaction_type',
        'points',
        'order',
        'note',
        'created_by',
        'created_at',
    )
    can_delete = False


@admin.register(LoyaltyCard)
class LoyaltyCardAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'customer',
        'shop',
        'points_balance',
        'total_points_earned',
        'total_points_redeemed',
        'created_at',
    )
    list_filter = ('shop',)
    search_fields = ('customer__name', 'customer__phone')
    readonly_fields = (
        'id',
        'points_balance',
        'total_points_earned',
        'total_points_redeemed',
        'created_at',
        'updated_at',
    )
    inlines = (LoyaltyTransactionInline,)


@admin.register(LoyaltyTransaction)
class LoyaltyTransactionAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('card', 'transaction_type', 'points', 'created_by', 'created_at')
    list_filter = ('transaction_type', 'shop')
    readonly_fields = ('id', 'created_at')
