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


# ─── Sérialiseurs facture (étape 6B) ───────────────────────────────────────
#
# Les valeurs monétaires et la date sont exposées sous forme de string : elles
# proviennent du dict JSON persisté et suivent le contrat du service IA. On
# évite ainsi toute réinterprétation numérique côté serializer (Decimal quantize
# implicite, cast float) qui pourrait diverger de la source.


class _InvoiceLineSerializer(serializers.Serializer):
    description = serializers.CharField(allow_blank=True)
    supplier_reference = serializers.CharField(allow_null=True, allow_blank=True)
    quantity = serializers.CharField(allow_null=True)
    unit_price = serializers.CharField(allow_null=True)
    line_total = serializers.CharField(allow_null=True)
    source_line_indices = serializers.ListField(child=serializers.IntegerField())


class _InvoiceSerializer(serializers.Serializer):
    supplier_name = serializers.CharField(allow_null=True, allow_blank=True)
    invoice_number = serializers.CharField(allow_null=True, allow_blank=True)
    invoice_date = serializers.CharField(allow_null=True)
    currency = serializers.CharField(allow_null=True, allow_blank=True)
    subtotal = serializers.CharField(allow_null=True)
    tax_amount = serializers.CharField(allow_null=True)
    total = serializers.CharField(allow_null=True)
    lines = _InvoiceLineSerializer(many=True)
    warnings = serializers.ListField(child=serializers.CharField(allow_blank=True))


def _sanitize_invoice_line(entry: object) -> dict | None:
    """Whitelist stricte des champs d'une ligne facture."""
    if not isinstance(entry, dict):
        return None
    indices_raw = entry.get('source_line_indices')
    indices = (
        [int(v) for v in indices_raw if isinstance(v, int) and not isinstance(v, bool)]
        if isinstance(indices_raw, list)
        else []
    )
    return {
        'description': str(entry.get('description', '')),
        'supplier_reference': _optional_str(entry.get('supplier_reference')),
        'quantity': _optional_str(entry.get('quantity')),
        'unit_price': _optional_str(entry.get('unit_price')),
        'line_total': _optional_str(entry.get('line_total')),
        'source_line_indices': indices,
    }


def _sanitize_invoice(block: object) -> dict | None:
    """Whitelist stricte des clés facture — écarte toute clé non prévue.

    Pas un contrôle de sécurité au sens strict (l'écriture est déjà validée
    côté service), mais un garde-fou contre une régression future qui
    introduirait un champ non prévu et l'exposerait sans revue.
    """
    if not isinstance(block, dict):
        return None
    lines_raw = block.get('lines', [])
    lines = (
        [line for line in (_sanitize_invoice_line(e) for e in lines_raw) if line is not None]
        if isinstance(lines_raw, list)
        else []
    )
    warnings_raw = block.get('warnings', [])
    warnings = (
        [str(w) for w in warnings_raw if isinstance(w, str)]
        if isinstance(warnings_raw, list)
        else []
    )
    return {
        'supplier_name': _optional_str(block.get('supplier_name')),
        'invoice_number': _optional_str(block.get('invoice_number')),
        'invoice_date': _optional_str(block.get('invoice_date')),
        'currency': _optional_str(block.get('currency')),
        'subtotal': _optional_str(block.get('subtotal')),
        'tax_amount': _optional_str(block.get('tax_amount')),
        'total': _optional_str(block.get('total')),
        'lines': lines,
        'warnings': warnings,
    }


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


class OcrResultDetailSerializer(serializers.Serializer):
    """Contrat de lecture d'un `OcrResult` par le commerçant.

    N'expose *que* les données nécessaires à l'écran de revue :
    - identifiants + statut ;
    - texte reconnu + lignes détectées avec confiance et bbox ;
    - proposition de structure facture (`invoice`) — nullable tant que la
      structuration LLM n'a pas abouti ;
    - message d'erreur (générique) si l'OCR ou la structuration a échoué.

    N'expose *jamais* : `object_key`, URL S3, l'utilisateur qui a uploadé,
    le contenu brut de `structured_data` (seuls les champs whitelistés
    ci-dessus fuitent — toute clé imprévue est écartée).
    """

    ocr_result_id = serializers.UUIDField()
    document_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=OcrResult.STATUS_CHOICES)
    raw_text = serializers.CharField(allow_blank=True)
    confidence_score = serializers.DecimalField(
        max_digits=4, decimal_places=3, allow_null=True,
    )
    lines = _OcrLineSerializer(many=True)
    invoice = _InvoiceSerializer(allow_null=True)
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

        invoice_block = (
            structured.get('invoice') if isinstance(structured, dict) else None
        )
        invoice = _sanitize_invoice(invoice_block)

        return cls({
            'ocr_result_id': ocr_result.pk,
            'document_id': ocr_result.uploaded_document_id,
            'status': ocr_result.status,
            'raw_text': ocr_result.raw_text,
            'confidence_score': ocr_result.confidence_score,
            'lines': lines,
            'invoice': invoice,
            'error_message': ocr_result.error_message,
            'created_at': ocr_result.created_at,
            'updated_at': ocr_result.updated_at,
        }).data
