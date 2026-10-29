from django.contrib import admin

from apps.core.admin_site import ReadOnlyAdminMixin

from .models import OcrResult, ProductScanUsage, SupplierLineMatch, UploadedDocument


@admin.register(UploadedDocument)
class UploadedDocumentAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'shop',
        'document_type',
        'original_filename',
        'uploaded_by_user',
        'created_at',
    )
    list_filter = ('document_type', 'shop')
    search_fields = ('original_filename', 'object_key')
    readonly_fields = ('id', 'created_at')


@admin.register(OcrResult)
class OcrResultAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'shop',
        'uploaded_document',
        'status',
        'confidence_score',
        'created_at',
    )
    list_filter = ('status', 'shop')
    # Liste fermée : `raw_text` et `structured_data` (contenu lu dans le fichier)
    # ne sont jamais affichés.
    fields = (
        'id',
        'shop',
        'uploaded_document',
        'status',
        'confidence_score',
        'validated_by_user',
        'validated_at',
        'error_message',
        'created_at',
        'updated_at',
    )
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(ProductScanUsage)
class ProductScanUsageAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('shop', 'month', 'vision_count', 'text_count', 'updated_at')
    search_fields = ('shop__name',)
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(SupplierLineMatch)
class SupplierLineMatchAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'shop',
        'supplier_key',
        'label_key',
        'variant',
        'is_ignored',
        'updated_at',
    )
    list_filter = ('is_ignored',)
    search_fields = ('shop__name', 'supplier_key', 'label_key')
    readonly_fields = ('id', 'created_at', 'updated_at')
