from django.contrib import admin

from .models import OcrResult, UploadedDocument


@admin.register(UploadedDocument)
class UploadedDocumentAdmin(admin.ModelAdmin):
    list_display = ('shop', 'document_type', 'original_filename', 'uploaded_by_user', 'created_at')
    list_filter = ('document_type', 'shop')
    search_fields = ('original_filename', 'object_key')
    readonly_fields = ('id', 'created_at')


@admin.register(OcrResult)
class OcrResultAdmin(admin.ModelAdmin):
    list_display = ('shop', 'uploaded_document', 'status', 'confidence_score', 'created_at')
    list_filter = ('status', 'shop')
    readonly_fields = ('id', 'created_at', 'updated_at')
