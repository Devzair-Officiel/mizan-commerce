from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import ClassVar

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers

from .models import OcrResult, UploadedDocument
from .services import (
    REVIEW_SCHEMA_VERSION,
    InvalidFileSignatureError,
    validate_file_signature,
)


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


# ─── Sérialiseurs matching (étape 7) ───────────────────────────────────────
#
# Le matching est un enrichissement déterministe produit côté Django : chaque
# ligne facture reçoit 0..3 candidats `ProductVariant` de la boutique. Aucun
# candidat n'est *validé* automatiquement — l'écran de revue l'exigera de
# l'utilisateur (étape 8).
#
# Le namespace matching a son propre `status` : il peut valoir `'failed'`
# tandis que l'OcrResult global reste `'done'`. Cela permet à l'UI d'afficher
# la facture même si le matching a levé (dépendance catalogue, DB timeout…).

_MATCH_KIND_CHOICES: tuple[tuple[str, str], ...] = (
    ('barcode_exact', 'barcode_exact'),
    ('sku_exact', 'sku_exact'),
    ('name_similarity', 'name_similarity'),
)
_MATCHING_STATUS_CHOICES: tuple[tuple[str, str], ...] = (
    ('done', 'done'),
    ('failed', 'failed'),
)


class _MatchingCandidateSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    product_id = serializers.UUIDField()
    product_name = serializers.CharField(allow_blank=True)
    packaging_name = serializers.CharField(allow_blank=True)
    match_kind = serializers.ChoiceField(choices=_MATCH_KIND_CHOICES)
    similarity_score = serializers.IntegerField(min_value=0, max_value=100)


class _MatchingLineSerializer(serializers.Serializer):
    invoice_line_index = serializers.IntegerField(min_value=0)
    candidates = _MatchingCandidateSerializer(many=True)


class _MatchingSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=_MATCHING_STATUS_CHOICES)
    lines = _MatchingLineSerializer(many=True)


def _sanitize_matching_candidate(entry: object) -> dict | None:
    """Whitelist stricte d'un candidat matching — écarte toute clé imprévue."""
    if not isinstance(entry, dict):
        return None
    kind = entry.get('match_kind')
    if kind not in {'barcode_exact', 'sku_exact', 'name_similarity'}:
        return None
    variant_id = entry.get('variant_id')
    product_id = entry.get('product_id')
    if variant_id is None or product_id is None:
        return None
    score_raw = entry.get('similarity_score')
    # `bool` est un `int` en Python — on refuse pour ne pas laisser passer
    # `True` comme score 1.
    if isinstance(score_raw, bool) or not isinstance(score_raw, int):
        return None
    if score_raw < 0 or score_raw > 100:
        return None
    return {
        'variant_id': str(variant_id),
        'product_id': str(product_id),
        'product_name': str(entry.get('product_name', '')),
        'packaging_name': str(entry.get('packaging_name', '')),
        'match_kind': kind,
        'similarity_score': score_raw,
    }


def _sanitize_matching_line(entry: object) -> dict | None:
    if not isinstance(entry, dict):
        return None
    index_raw = entry.get('invoice_line_index')
    if isinstance(index_raw, bool) or not isinstance(index_raw, int):
        return None
    if index_raw < 0:
        return None
    candidates_raw = entry.get('candidates', [])
    candidates = (
        [
            c for c in (_sanitize_matching_candidate(e) for e in candidates_raw)
            if c is not None
        ]
        if isinstance(candidates_raw, list)
        else []
    )
    return {'invoice_line_index': index_raw, 'candidates': candidates}


def _sanitize_matching(block: object) -> dict | None:
    """Whitelist stricte du namespace matching.

    Filet défensif : tout comme `_sanitize_invoice`, l'objectif n'est pas de
    filtrer une entrée hostile (le namespace est écrit par notre pipeline)
    mais d'empêcher une régression future d'exfiltrer une clé imprévue via
    l'API en ré-utilisant ce champ.
    """
    if not isinstance(block, dict):
        return None
    status_value = block.get('status')
    if status_value not in {'done', 'failed'}:
        return None
    lines_raw = block.get('lines', [])
    lines = (
        [
            line for line in (_sanitize_matching_line(e) for e in lines_raw)
            if line is not None
        ]
        if isinstance(lines_raw, list)
        else []
    )
    return {'status': status_value, 'lines': lines}


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

    Le namespace `matching` (étape 7) a son propre statut et peut valoir
    `null` (aucun matching lancé, ex. OCR pending ou étape LLM échouée).
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
    matching = _MatchingSerializer(allow_null=True)
    review = serializers.DictField(allow_null=True)
    validated_at = serializers.DateTimeField(allow_null=True)
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

        matching_block = (
            structured.get('matching') if isinstance(structured, dict) else None
        )
        matching = _sanitize_matching(matching_block)

        review_block = (
            structured.get('review') if isinstance(structured, dict) else None
        )
        review = _sanitize_review(review_block)

        return cls({
            'ocr_result_id': ocr_result.pk,
            'document_id': ocr_result.uploaded_document_id,
            'status': ocr_result.status,
            'raw_text': ocr_result.raw_text,
            'confidence_score': ocr_result.confidence_score,
            'lines': lines,
            'invoice': invoice,
            'matching': matching,
            'review': review,
            'validated_at': ocr_result.validated_at,
            'error_message': ocr_result.error_message,
            'created_at': ocr_result.created_at,
            'updated_at': ocr_result.updated_at,
        }).data


# ─── Sérialiseurs revue humaine (Step 9A — URS-044/045) ─────────────────────
#
# Le contrat monétaire du frontend est *stricte* : quantités et prix arrivent
# sous forme de string JSON, pas de nombre. On refuse int/float à l'entrée
# pour éviter :
#   - la perte de précision d'un float JS (0.1 + 0.2 ≠ 0.3) ;
#   - une conversion silencieuse via `CharField.to_internal_value` qui ferait
#     `str(number)` sans que le contrat de payload soit respecté.

# Limite raisonnable pour la description corrigée par l'utilisateur — évite un
# payload abusif tout en restant plus large que la longueur typique observée
# sur une facture (~150 caractères) pour absorber les corrections manuelles.
_REVIEW_DESCRIPTION_MAX_LENGTH = 500

_REVIEW_DECISION_CHOICES: tuple[tuple[str, str], ...] = (
    ('stock', 'stock'),
    ('ignore', 'ignore'),
)


class _DecimalStringField(serializers.Field):
    """Champ obligeant l'envoi d'une string JSON pour un montant Decimal.

    Refuser explicitement int/float garantit que le contrat côté serveur
    reste Decimal exact — un float JS 0.1 sérialisé en JSON `0.1` puis
    reconverti en Decimal donne `Decimal('0.1000000000000000055511151231...')`.
    En forçant le client à envoyer `"0.10"`, on évite toute divergence.

    Rejette également NaN et Infinity : ces valeurs Decimal légales
    n'ont aucun sens pour une quantité ou un prix et casseraient les
    comparaisons ultérieures (Decimal('NaN') != Decimal('NaN')).
    """

    default_error_messages: ClassVar[dict[str, str]] = {
        'not_string': (
            'Doit être une chaîne de caractères (utilisez "10.00", pas 10.00).'
        ),
        'invalid_decimal': 'Format Decimal invalide.',
        'not_finite': 'NaN et Infinity ne sont pas autorisés.',
        'out_of_range': 'Valeur hors de la plage autorisée.',
        'too_many_digits': 'Trop de chiffres au total.',
        'too_many_decimals': 'Trop de décimales.',
        'below_min': 'Valeur inférieure au minimum autorisé.',
    }

    def __init__(
        self,
        *,
        max_digits: int,
        decimal_places: int,
        min_value: Decimal | None = None,
        **kwargs: object,
    ) -> None:
        self.max_digits = max_digits
        self.decimal_places = decimal_places
        self.min_value = min_value
        super().__init__(**kwargs)

    def to_internal_value(self, data: object) -> Decimal:
        # `bool` est un `int` en Python — on l'écarte explicitement avant
        # le contrôle `isinstance(data, str)` pour ne pas laisser passer
        # `True` comme la string 'True' via un contournement.
        if isinstance(data, bool) or not isinstance(data, str):
            self.fail('not_string')
        try:
            value = Decimal(data)
        except (InvalidOperation, ValueError, TypeError):
            self.fail('invalid_decimal')
        if not value.is_finite():
            self.fail('not_finite')

        # Vérification de la précision : on analyse la représentation
        # décimale via `as_tuple` — `Decimal('1E3')` a 4 chiffres même si
        # sa représentation est courte, ce qui compte pour max_digits.
        _, digits, exponent = value.as_tuple()
        # Pour un Decimal fini, `exponent` est un `int`. On garde une
        # normalisation défensive au cas où pandas / numpy passeraient.
        if not isinstance(exponent, int):  # pragma: no cover
            self.fail('invalid_decimal')
        if exponent > 0:
            integer_digits = len(digits) + exponent
            decimal_digits = 0
        else:
            decimal_digits = -exponent
            integer_digits = max(len(digits) - decimal_digits, 0)
        if decimal_digits > self.decimal_places:
            self.fail('too_many_decimals')
        if integer_digits + self.decimal_places > self.max_digits:
            self.fail('too_many_digits')

        if self.min_value is not None and value < self.min_value:
            self.fail('below_min')
        return value

    def to_representation(self, value: Decimal) -> str:
        return str(value)


class _ReviewLineRequestSerializer(serializers.Serializer):
    """Une ligne de la revue humaine — validée strictement côté serveur."""

    invoice_line_index = serializers.IntegerField(min_value=0)
    description = serializers.CharField(
        max_length=_REVIEW_DESCRIPTION_MAX_LENGTH, allow_blank=True,
    )
    quantity = _DecimalStringField(
        max_digits=14, decimal_places=3, allow_null=True,
    )
    unit_price = _DecimalStringField(
        max_digits=12, decimal_places=2, allow_null=True,
    )
    line_total = _DecimalStringField(
        max_digits=12, decimal_places=2, allow_null=True,
    )
    decision = serializers.ChoiceField(choices=_REVIEW_DECISION_CHOICES)
    variant_id = serializers.UUIDField(allow_null=True)

    def validate_invoice_line_index(self, value: object) -> int:
        # IntegerField accepte les bool (bool est int) — on écarte pour ne
        # pas laisser passer `True` comme l'index 1.
        if isinstance(value, bool):
            raise serializers.ValidationError('Doit être un entier, pas un booléen.')
        return value


class ValidateInvoiceReviewRequestSerializer(serializers.Serializer):
    """Payload complet de validation humaine d'une facture OCR."""

    lines = _ReviewLineRequestSerializer(many=True, allow_empty=True)


def _sanitize_review(block: object) -> dict | None:
    """Whitelist stricte du namespace `review` exposé côté API.

    Même logique défensive que `_sanitize_invoice` / `_sanitize_matching` :
    on ne fait confiance à rien de ce qui est écrit dans `structured_data`,
    même par notre propre pipeline. Toute clé imprévue est écartée pour
    empêcher une régression future d'exposer un champ non revu.
    """
    if not isinstance(block, dict):
        return None
    if block.get('schema_version') != REVIEW_SCHEMA_VERSION:
        return None
    lines_raw = block.get('lines', [])
    if not isinstance(lines_raw, list):
        return None
    sanitized_lines = []
    for entry in lines_raw:
        if not isinstance(entry, dict):
            continue
        index = entry.get('invoice_line_index')
        if isinstance(index, bool) or not isinstance(index, int) or index < 0:
            continue
        decision = entry.get('decision')
        if decision not in {'stock', 'ignore'}:
            continue
        variant_id = entry.get('variant_id')
        variant_id_str = (
            str(variant_id) if isinstance(variant_id, str) else None
        )
        sanitized_lines.append({
            'invoice_line_index': index,
            'description': str(entry.get('description', '')),
            'quantity': _optional_str(entry.get('quantity')),
            'unit_price': _optional_str(entry.get('unit_price')),
            'line_total': _optional_str(entry.get('line_total')),
            'decision': decision,
            'variant_id': variant_id_str,
        })
    return {
        'schema_version': REVIEW_SCHEMA_VERSION,
        'lines': sanitized_lines,
    }
