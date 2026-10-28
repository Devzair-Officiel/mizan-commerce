from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import Shop, ShopMember


class ShopMemberInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = ShopMember
    extra = 0
    fields = ("user", "role", "permissions", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Shop)
class ShopAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        "name",
        "currency",
        "country",
        "timezone",
        "owner_email",
        "created_at",
    )
    search_fields = ("name",)
    ordering = ("-created_at",)
    # Liste fermée : `invoice_iban` et `invoice_bic` (données bancaires) n'y
    # figurent jamais. Un champ ajouté au modèle n'apparaît pas sans décision.
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "id",
                    "name",
                    "currency",
                    "country",
                    "timezone",
                    "catalog_kind",
                    "fulfillment_mode",
                )
            },
        ),
        (
            "Facturation",
            {
                "fields": (
                    "legal_address",
                    "tax_id",
                    "siret",
                    "vat_number",
                    "legal_mentions",
                    "invoice_vat_regime",
                    "default_tax_rate",
                    "default_payment_terms_days",
                    "invoice_payment_methods",
                )
            },
        ),
        ("Dates", {"fields": ("onboarding_completed_at", "created_at", "updated_at")}),
    )
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (ShopMemberInline,)

    def owner_email(self, obj):
        member = obj.members.filter(role="owner").select_related("user").first()
        return member.user.email if member else "—"

    owner_email.short_description = "Owner"


@admin.register(ShopMember)
class ShopMemberAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("shop", "user", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("shop__name", "user__email")
    readonly_fields = ("id", "created_at")
