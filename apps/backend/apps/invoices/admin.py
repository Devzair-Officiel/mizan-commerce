from django.contrib import admin

from .models import Invoice, InvoiceLine, InvoiceSequence


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    readonly_fields = ('shop', 'description', 'quantity', 'unit_price_ht', 'line_subtotal_ht', 'created_at')


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('number', 'shop', 'buyer_name', 'status', 'total_ttc', 'issued_at')
    list_filter = ('status', 'shop')
    search_fields = ('number', 'buyer_name', 'seller_name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [InvoiceLineInline]


@admin.register(InvoiceSequence)
class InvoiceSequenceAdmin(admin.ModelAdmin):
    list_display = ('shop', 'last_number', 'updated_at')
    list_filter = ('shop',)
