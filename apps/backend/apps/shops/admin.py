from django.contrib import admin

from .models import Shop, ShopMember


class ShopMemberInline(admin.TabularInline):
    model = ShopMember
    extra = 0
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('user',)


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ('name', 'currency', 'country', 'timezone', 'owner_email', 'created_at')
    search_fields = ('name',)
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = (ShopMemberInline,)

    def owner_email(self, obj):
        member = obj.members.filter(role='owner').select_related('user').first()
        return member.user.email if member else '—'
    owner_email.short_description = 'Owner'


@admin.register(ShopMember)
class ShopMemberAdmin(admin.ModelAdmin):
    list_display = ('shop', 'user', 'role', 'created_at')
    list_filter = ('role',)
    search_fields = ('shop__name', 'user__email')
    readonly_fields = ('id', 'created_at')
