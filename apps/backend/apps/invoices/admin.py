from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import Invoice, InvoiceLine, InvoiceSequence


class InvoiceLineInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = InvoiceLine
    extra = 0
    fields = (
        "position",
        "description",
        "details",
        "unit",
        "quantity",
        "unit_price_ht",
        "line_subtotal_ht",
    )


@admin.register(Invoice)
class InvoiceAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Lecture seule, sans suppression : numéro, montants et snapshots sont figés
    à l'émission (`invoices.services`)."""

    list_display = ("number", "shop", "buyer_name", "status", "total_ttc", "issued_at")
    list_filter = ("status", "shop")
    search_fields = ("number", "buyer_name", "seller_name")
    # Liste fermée : `presentation` (snapshot de mise en page) contient l'IBAN et
    # le BIC de la boutique, il n'est jamais affiché.
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "id",
                    "shop",
                    "order",
                    "customer",
                    "number",
                    "kind",
                    "status",
                    "operation_category",
                    "currency",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "issued_at",
                    "due_date",
                    "payment_terms_days",
                    "paid_at",
                    "cancelled_at",
                    "created_at",
                    "updated_at",
                )
            },
        ),
        (
            "Vendeur",
            {
                "fields": (
                    "seller_name",
                    "seller_address",
                    "seller_tax_id",
                    "seller_legal_mentions",
                    "seller_country",
                )
            },
        ),
        (
            "Acheteur",
            {
                "fields": (
                    "buyer_name",
                    "buyer_address",
                    "buyer_postal_code",
                    "buyer_city",
                    "buyer_country",
                    "buyer_email",
                    "buyer_phone",
                    "buyer_siren",
                )
            },
        ),
        (
            "Montants",
            {
                "fields": (
                    "subtotal_ht",
                    "discount_amount",
                    "shipping_amount",
                    "tax_rate",
                    "tax_amount",
                    "total_ttc",
                    "amount_paid",
                )
            },
        ),
        ("Notes", {"fields": ("notes",)}),
    )
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [InvoiceLineInline]


@admin.register(InvoiceSequence)
class InvoiceSequenceAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("shop", "last_number", "updated_at")
    list_filter = ("shop",)
    readonly_fields = ("updated_at",)
