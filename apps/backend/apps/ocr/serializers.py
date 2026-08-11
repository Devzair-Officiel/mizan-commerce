from __future__ import annotations

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers

from .models import OcrResult, UploadedDocument
from .services import InvalidFileSignatureError, validate_file_signature


class SupplierInvoiceUploadRequestSerializer(serializers.Serializer):
    """Valide la requête d'upload : présence, taille, MIME, signature réelle."""

    document = serializers.FileField()

    def validate_document(self, file: UploadedFile) -> UploadedFile:
        max_bytes = settings.OCR_DOCUMENT_MAX_SIZE_MB * 1024 * 1024
        allowed_types: set[str] = settings.OCR_DOCUMENT_ALLOWED_TYPES

        if file.size == 0:
            raise serializers.ValidationError('Le fichier est vide.')
        if file.size > max_bytes:
            raise serializers.ValidationError(
                f'Le document ne doit pas dépasser {settings.OCR_DOCUMENT_MAX_SIZE_MB} Mo.'
            )
        if file.content_type not in allowed_types:
            raise serializers.ValidationError(
                f'Type de fichier non autorisé : {file.content_type}. '
                'Formats acceptés : JPEG, PNG, WebP.'
            )
        # Ne pas se fier uniquement au content_type : le client peut le forger.
        try:
            validate_file_signature(file, file.content_type)
        except InvalidFileSignatureError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return file


class SupplierInvoiceUploadResponseSerializer(serializers.Serializer):
    """Réponse contrôlée — n'expose ni object_key ni URL permanente."""

    document_id = serializers.UUIDField()
    ocr_result_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=OcrResult.STATUS_CHOICES)
    original_filename = serializers.CharField(allow_blank=True)
    mime_type = serializers.CharField(allow_blank=True)
    size_bytes = serializers.IntegerField(allow_null=True)
    created_at = serializers.DateTimeField()

    @classmethod
    def from_models(
        cls,
        document: UploadedDocument,
        ocr_result: OcrResult,
    ) -> dict:
        return cls({
            'document_id': document.pk,
            'ocr_result_id': ocr_result.pk,
            'status': ocr_result.status,
            'original_filename': document.original_filename,
            'mime_type': document.mime_type,
            'size_bytes': document.size_bytes,
            'created_at': document.created_at,
        }).data
