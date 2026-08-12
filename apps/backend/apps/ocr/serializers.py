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


class _OcrLineSerializer(serializers.Serializer):
    text = serializers.CharField(allow_blank=True)
    confidence = serializers.FloatField()
    bbox = serializers.ListField(child=serializers.IntegerField())


class OcrResultDetailSerializer(serializers.Serializer):
    """Contrat de lecture d'un `OcrResult` par le commerçant.

    N'expose *que* les données nécessaires à l'écran de revue :
    - identifiants + statut ;
    - texte reconnu + lignes détectées avec confiance et bbox ;
    - message d'erreur (générique) si l'OCR a échoué.

    N'expose *jamais* : `object_key`, URL S3, l'utilisateur qui a uploadé,
    le contenu complet de `structured_data` (namespace `invoice` réservé
    aux étapes ultérieures).
    """

    ocr_result_id = serializers.UUIDField()
    document_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=OcrResult.STATUS_CHOICES)
    raw_text = serializers.CharField(allow_blank=True)
    confidence_score = serializers.DecimalField(
        max_digits=4, decimal_places=3, allow_null=True,
    )
    lines = _OcrLineSerializer(many=True)
    error_message = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    @classmethod
    def from_model(cls, ocr_result: OcrResult) -> dict:
        structured = ocr_result.structured_data or {}
        ocr_block = structured.get('ocr') if isinstance(structured, dict) else None
        lines_raw = (
            ocr_block.get('lines', []) if isinstance(ocr_block, dict) else []
        )

        # Filet défensif : on n'expose que ce qui correspond à notre schéma,
        # pas ce qui pourrait s'être glissé par un chemin d'écriture parallèle.
        lines = [
            {
                'text': str(entry.get('text', '')),
                'confidence': float(entry.get('confidence', 0.0)),
                'bbox': [int(v) for v in entry.get('bbox', [])] if isinstance(entry.get('bbox'), list) else [],
            }
            for entry in lines_raw
            if isinstance(entry, dict)
        ]

        return cls({
            'ocr_result_id': ocr_result.pk,
            'document_id': ocr_result.uploaded_document_id,
            'status': ocr_result.status,
            'raw_text': ocr_result.raw_text,
            'confidence_score': ocr_result.confidence_score,
            'lines': lines,
            'error_message': ocr_result.error_message,
            'created_at': ocr_result.created_at,
            'updated_at': ocr_result.updated_at,
        }).data
