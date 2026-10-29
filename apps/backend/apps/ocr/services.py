"""Logique métier OCR.

Cette étape ne fait qu'ingérer une photo ou un PDF de facture fournisseur :
- validation légère de la signature binaire du fichier (et, pour un PDF,
  mot de passe et nombre de pages — voir `pdf.py`) ;
- upload dans l'Object Storage privé ;
- création d'un `UploadedDocument` + d'un `OcrResult` (status=pending).

Aucun appel OCR / IA n'est déclenché ici — c'est l'objet des étapes suivantes.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Literal, NamedTuple
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import caches
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.audit import log_action
from apps.core.storage import delete_object, upload_fileobj
from apps.products.models import ProductVariant
from apps.stock.services import EntryLine, EntryReference, create_entry

from .ai_client import (
    AiProductScanLocal,
    AiProductVision,
    AiServiceUnavailableError,
    ScanPhoto,
    scan_product_locally_with_ai_service,
    scan_product_vision_with_ai_service,
)
from .matching import line_label_key, normalize_text
from .models import OcrResult, ProductScanUsage, SupplierLineMatch, UploadedDocument
from .open_food_facts import is_restricted_gtin, is_valid_gtin, lookup_barcode
from .pdf import validate_invoice_pdf

if TYPE_CHECKING:
    from uuid import UUID

    from django.core.files.uploadedfile import UploadedFile

    from apps.accounts.models import User
    from apps.shops.models import Shop
    from apps.stock.models import StockMovement


logger = logging.getLogger(__name__)


__all__ = (
    'REVIEW_SCHEMA_VERSION',
    'InvalidConfidenceScoreError',
    'InvalidFileSignatureError',
    'InvalidOcrTransitionError',
    'InvoiceAlreadyRecordedError',
    'InvoiceEntryLine',
    'OcrResultNotReviewableError',
    'ProductScanResult',
    'ReviewConflictError',
    'ReviewPayloadValidationError',
    'SupplierInvoiceUpload',
    'build_canonical_review',
    'create_supplier_invoice_upload',
    'mark_ocr_done',
    'mark_ocr_failed',
    'mark_ocr_processing',
    'record_invoice_entry',
    'release_text_scan',
    'release_vision_scan',
    'reserve_text_scan',
    'reserve_vision_scan',
    'scan_product_image',
    'scan_quota_month',
    'validate_file_signature',
    'validate_invoice_review',
)


# Bornes du score de confiance retourné par la reconnaissance. Alignées sur
# les validators du modèle (`OcrResult.confidence_score`), qui ne sont pas
# exécutés automatiquement par `Model.save()` — on vérifie donc explicitement
# ici pour ne jamais persister une valeur hors intervalle.
_CONFIDENCE_MIN = Decimal('0.000')
_CONFIDENCE_MAX = Decimal('1.000')


class InvalidFileSignatureError(ValueError):
    """Le binaire du fichier ne correspond pas au MIME annoncé.

    Exception domaine — laisse le service indépendant de DRF. Le serializer
    l'attrape et la convertit en `serializers.ValidationError`.
    """


class InvalidOcrTransitionError(ValueError):
    """Transition de statut non autorisée sur un `OcrResult`.

    Exception domaine (subclass de `ValueError`) — permet aux futures tâches
    Celery et endpoints de gérer les cas d'erreur sans coupler ce module à
    DRF. Le message inclut la transition tentée pour faciliter le debug.
    """


class InvalidConfidenceScoreError(ValueError):
    """Score de confiance en dehors de l'intervalle attendu (0.000–1.000).

    Exception domaine — pendant symétrique de `InvalidOcrTransitionError`
    pour tout ce qui bloque la finalisation d'un OCR. Les validators du
    modèle ne sont pas exécutés par `Model.save()` : on doit donc valider
    explicitement au service avant persistance.
    """


# Mapping MIME → extension utilisée pour construire l'object_key. On refuse
# de dériver l'extension du filename utilisateur (potentiellement mensonger).
_MIME_TO_EXTENSION: dict[str, str] = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
}


class SupplierInvoiceUpload(NamedTuple):
    document: UploadedDocument
    ocr_result: OcrResult


def validate_file_signature(file: UploadedFile, declared_mime: str) -> None:
    """Vérifie que les premiers octets correspondent au MIME annoncé.

    Le `content_type` d'un `UploadedFile` provient de l'en-tête HTTP fourni
    par le client — donc trivialement forgeable. On lit ici la « magic
    number » du fichier pour détecter un binaire qui ne correspond pas à
    l'image annoncée. Implémentation volontairement minimaliste : pas de
    dépendance externe (python-magic, filetype…), on couvre uniquement les
    formats acceptés à cette étape.
    """
    # 12 octets suffisent pour distinguer JPEG / PNG / WebP / PDF.
    file.seek(0)
    header = file.read(12)
    file.seek(0)

    if declared_mime == 'image/jpeg':
        ok = header.startswith(b'\xff\xd8\xff')
    elif declared_mime == 'image/png':
        ok = header.startswith(b'\x89PNG\r\n\x1a\n')
    elif declared_mime == 'image/webp':
        ok = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
    elif declared_mime == 'application/pdf':
        ok = header.startswith(b'%PDF-')
    else:
        ok = False

    if not ok:
        raise InvalidFileSignatureError(
            'Le contenu du fichier ne correspond pas au type déclaré.'
        )


def create_supplier_invoice_upload(
    *,
    shop: Shop,
    user: User,
    file: UploadedFile,
) -> SupplierInvoiceUpload:
    """Ingère une photo ou un PDF de facture fournisseur.

    Contrat :
    - `shop` provient de `get_shop(request.user)` — jamais du client.
    - `file` a déjà été validé côté serializer (présence, taille, MIME).
    - le `OcrResult` créé partage strictement le même `shop` que le document.

    En cas d'échec DB après l'upload S3, l'objet distant est supprimé pour
    éviter les fichiers orphelins (pas de transaction distribuée, simple
    compensation manuelle).
    """
    extension = _MIME_TO_EXTENSION[file.content_type]
    object_key = f'ocr/{shop.pk}/supplier-invoices/{uuid.uuid4()}.{extension}'

    # Sécurité : re-vérifie la signature juste avant l'upload — on ne veut
    # pas se retrouver à uploader un binaire arbitraire même si le serializer
    # a été court-circuité par un usage direct du service.
    validate_file_signature(file, file.content_type)
    if file.content_type == 'application/pdf':
        validate_invoice_pdf(file)

    upload_fileobj(file, object_key, file.content_type)

    try:
        with transaction.atomic():
            document = UploadedDocument.objects.create(
                shop=shop,
                uploaded_by_user=user,
                document_type=UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE,
                object_key=object_key,
                original_filename=(file.name or '')[:255],
                mime_type=file.content_type,
                size_bytes=file.size,
            )
            ocr_result = OcrResult.objects.create(
                shop=shop,
                uploaded_document=document,
                status=OcrResult.STATUS_PENDING,
            )
    except Exception:
        # Compensation : le fichier est déjà distant, on le retire pour
        # ne pas laisser d'orphelin. `delete_object` log mais ne relève pas.
        logger.exception(
            "Échec DB après upload OCR — nettoyage de l'objet %s", object_key,
        )
        delete_object(object_key)
        raise

    return SupplierInvoiceUpload(document=document, ocr_result=ocr_result)


# ─── Transitions de statut OcrResult ────────────────────────────────────────
#
# La machine à états est volontairement stricte : chaque transition n'accepte
# qu'un statut source unique. Le statut `validated` est réservé à une action
# métier explicite (relecture humaine) et n'est jamais posé par ces fonctions.
#
# Chaque transition est protégée par `select_for_update` : un second worker
# qui tenterait la même transition en parallèle est bloqué jusqu'à la fin de
# la transaction courante, puis lit l'état déjà mis à jour et lève
# `InvalidOcrTransitionError` — pas de course silencieuse possible.


def _raise_invalid_transition(current: str, target: str) -> None:
    raise InvalidOcrTransitionError(
        f'Transition OCR invalide : {current} → {target}.'
    )


def mark_ocr_processing(ocr_result_id: UUID) -> OcrResult:
    """Bascule un OcrResult de `pending` vers `processing`.

    Appelée par la tâche Celery juste avant d'exécuter la reconnaissance :
    évite qu'un second worker ne reprenne un travail déjà en cours.
    """
    with transaction.atomic():
        result = OcrResult.objects.select_for_update().get(pk=ocr_result_id)
        if result.status != OcrResult.STATUS_PENDING:
            _raise_invalid_transition(result.status, OcrResult.STATUS_PROCESSING)
        result.status = OcrResult.STATUS_PROCESSING
        result.error_message = ''
        result.save(update_fields=['status', 'error_message', 'updated_at'])
    return result


def mark_ocr_done(
    ocr_result_id: UUID,
    *,
    raw_text: str,
    structured_data: dict | None = None,
    confidence_score: Decimal | None = None,
) -> OcrResult:
    """Termine une reconnaissance : `processing` → `done`.

    Stocke le texte brut et, si fournis, les données structurées et le score
    de confiance. Ne touche pas aux champs de validation humaine
    (`validated_by_user`, `validated_at`) — c'est un flux distinct.

    Le score de confiance est validé avant l'ouverture de la transaction :
    en cas de valeur hors bornes, aucun verrou n'est pris et le OcrResult
    reste dans son statut courant (`processing`).
    """
    if confidence_score is not None and not (
        _CONFIDENCE_MIN <= confidence_score <= _CONFIDENCE_MAX
    ):
        raise InvalidConfidenceScoreError(
            f'confidence_score doit être dans [{_CONFIDENCE_MIN}, {_CONFIDENCE_MAX}], '
            f'reçu : {confidence_score}.'
        )

    with transaction.atomic():
        result = OcrResult.objects.select_for_update().get(pk=ocr_result_id)
        if result.status != OcrResult.STATUS_PROCESSING:
            _raise_invalid_transition(result.status, OcrResult.STATUS_DONE)
        result.status = OcrResult.STATUS_DONE
        result.raw_text = raw_text
        result.error_message = ''
        update_fields = ['status', 'raw_text', 'error_message', 'updated_at']
        if structured_data is not None:
            result.structured_data = structured_data
            update_fields.append('structured_data')
        if confidence_score is not None:
            result.confidence_score = confidence_score
            update_fields.append('confidence_score')
        result.save(update_fields=update_fields)
    return result


def mark_ocr_failed(
    ocr_result_id: UUID,
    *,
    error_message: str,
    raw_text: str | None = None,
    structured_data: dict | None = None,
    confidence_score: Decimal | None = None,
) -> OcrResult:
    """Marque un OCR en échec : `processing` → `failed`.

    Le message d'erreur doit rester safe pour affichage : ne pas y injecter
    de stack trace ni de chemin serveur. Détails techniques → logs.

    Les paramètres optionnels `raw_text`, `structured_data`, `confidence_score`
    servent au cas « OCR réussi + étape suivante échouée » (ex. structuration
    LLM 6B) : on veut préserver ce qui a déjà été extrait pour ne pas re-payer
    l'OCR et permettre à l'utilisateur de consulter le texte reconnu même si
    la reconstruction structurée n'a pas abouti. Sans ces paramètres, le
    comportement historique est inchangé.
    """
    if confidence_score is not None and not (
        _CONFIDENCE_MIN <= confidence_score <= _CONFIDENCE_MAX
    ):
        raise InvalidConfidenceScoreError(
            f'confidence_score doit être dans [{_CONFIDENCE_MIN}, {_CONFIDENCE_MAX}], '
            f'reçu : {confidence_score}.'
        )

    with transaction.atomic():
        result = OcrResult.objects.select_for_update().get(pk=ocr_result_id)
        if result.status != OcrResult.STATUS_PROCESSING:
            _raise_invalid_transition(result.status, OcrResult.STATUS_FAILED)
        result.status = OcrResult.STATUS_FAILED
        result.error_message = error_message
        update_fields = ['status', 'error_message', 'updated_at']
        if raw_text is not None:
            result.raw_text = raw_text
            update_fields.append('raw_text')
        if structured_data is not None:
            result.structured_data = structured_data
            update_fields.append('structured_data')
        if confidence_score is not None:
            result.confidence_score = confidence_score
            update_fields.append('confidence_score')
        result.save(update_fields=update_fields)
    return result


# ─── Validation humaine d'une facture (Step 9A — URS-044/045) ──────────────
#
# Une fois l'OCR + la structuration LLM + le matching terminés (status='done'),
# la commerçante relit chaque ligne et choisit :
#   - `stock`  → cette ligne devra créer un StockMovement (Step 10)
#   - `ignore` → ligne conservée pour audit mais ignorée par le stock
#
# Cette étape N'AJOUTE PAS de mouvement de stock. Elle grave uniquement la
# décision humaine dans `structured_data['review']` et bascule le statut vers
# `validated`. Un endpoint dédié (Step 10) consommera ce namespace review pour
# créer les StockMovement — c'est la seule séparation qui garantit que la
# validation reste rétractable tant qu'aucun mouvement n'est écrit.

REVIEW_SCHEMA_VERSION = 1

REVIEW_DECISION_STOCK = 'stock'
REVIEW_DECISION_IGNORE = 'ignore'
_REVIEW_DECISIONS: frozenset[str] = frozenset({
    REVIEW_DECISION_STOCK, REVIEW_DECISION_IGNORE,
})

# Précisions Decimal alignées sur les colonnes ProductVariant (Decimal(14,3)
# pour la quantité, Decimal(12,2) pour les prix). Utilisées pour figer le
# format canonique côté JSON — permettant une comparaison byte-équivalente
# pour l'idempotence de retry.
_QUANTITY_PRECISION = Decimal('0.001')
_PRICE_PRECISION = Decimal('0.01')


class OcrResultNotReviewableError(ValueError):
    """OcrResult dans un statut qui ne permet pas la validation humaine.

    Levée par `validate_invoice_review` si le statut source n'est ni `done`
    ni `validated`. La vue traduit cette exception en 409 Conflict — l'API
    répond ainsi qu'un état est incompatible avec la transition demandée
    (ce n'est ni une erreur d'input ni un 404).
    """


class ReviewPayloadValidationError(ValueError):
    """Payload de revue en contradiction avec la facture ou le domaine.

    Regroupe : indices manquants/en trop/dupliqués, decision invalide,
    variante d'une autre boutique, produit/variante inactif, produit de
    type service, quantité nulle sur une ligne stock… La vue la traduit en
    400 Bad Request avec un message générique côté client.
    """


class ReviewConflictError(ValueError):
    """L'OcrResult est déjà validé avec un contenu différent.

    Levée par `validate_invoice_review` quand un retry idempotent est
    tenté mais que le payload canonique diffère de celui déjà enregistré.
    La vue traduit en 409 Conflict.
    """


def _quantize_decimal(value: Decimal, precision: Decimal) -> Decimal:
    """Force la précision d'un Decimal — évite qu'un client envoie `1` et
    qu'un retry envoie `1.000` sans que ce soit considéré comme le même
    payload par l'idempotence. On quantize toujours *avant* comparaison et
    persistence.
    """
    return value.quantize(precision)


def _canonical_amount(value: Decimal | None, precision: Decimal) -> str | None:
    """Convertit un Decimal en string canonique (nombre de décimales figé).

    `None` reste `None` — permet aux lignes `ignore` de ne pas être forcées
    d'envoyer un montant si le client ne l'a pas corrigé.
    """
    if value is None:
        return None
    return str(_quantize_decimal(value, precision))


def build_canonical_review(lines: list[dict]) -> dict:
    """Construit la forme canonique du namespace `review`.

    Cette fonction est pure (aucune query, aucun IO) — elle sert à la fois :
    1. à figer la forme persistée dans `structured_data['review']` ;
    2. à comparer un payload de retry à la version déjà stockée pour
       décider si on est en présence d'un doublon idempotent ou d'un
       conflit sémantique (`ReviewConflictError`).

    Les lignes sont triées par `invoice_line_index` : cela garantit que
    deux payloads équivalents mais envoyés dans des ordres différents
    aboutissent au *même* dict canonique.
    """
    canonical_lines = []
    for entry in lines:
        variant_id = entry.get('variant_id')
        canonical_lines.append({
            'invoice_line_index': int(entry['invoice_line_index']),
            'description': str(entry.get('description', '')),
            'quantity': _canonical_amount(entry.get('quantity'), _QUANTITY_PRECISION),
            'unit_price': _canonical_amount(entry.get('unit_price'), _PRICE_PRECISION),
            'line_total': _canonical_amount(entry.get('line_total'), _PRICE_PRECISION),
            'decision': str(entry['decision']),
            'variant_id': str(variant_id) if variant_id is not None else None,
        })
    canonical_lines.sort(key=lambda line: line['invoice_line_index'])
    return {
        'schema_version': REVIEW_SCHEMA_VERSION,
        'lines': canonical_lines,
    }


def _check_indices_contract(
    expected_indices: list[int],
    provided: list[dict],
) -> None:
    """Vérifie que le payload adresse exactement les lignes de la facture.

    Rejette : indices manquants, indices en trop, doublons. Ces trois cas
    partagent la même exception : côté client c'est une erreur de contrat,
    pas un problème sémantique par ligne. Message générique — les détails
    précis vont dans les logs applicatifs, pas dans la réponse HTTP.
    """
    provided_indices = [entry['invoice_line_index'] for entry in provided]

    if len(provided_indices) != len(set(provided_indices)):
        raise ReviewPayloadValidationError(
            'Le payload contient des invoice_line_index dupliqués.'
        )
    if set(provided_indices) != set(expected_indices):
        missing = sorted(set(expected_indices) - set(provided_indices))
        extra = sorted(set(provided_indices) - set(expected_indices))
        raise ReviewPayloadValidationError(
            'Les lignes de revue ne correspondent pas à la facture '
            f'(manquantes={missing}, en trop={extra}).'
        )


def _validate_stock_line_business(
    line: dict,
    *,
    variants_by_id: dict[str, ProductVariant],
    shop_id: uuid.UUID,
) -> None:
    """Vérifie une ligne `stock` : variant valide, actif, produit actif,
    de type product, appartenant à la boutique.

    Toutes les erreurs partagent le même message d'exception côté API —
    on ne révèle jamais si un variant_id inconnu existe dans une autre
    boutique (IDOR blindé). Les détails précis vont côté serveur uniquement.
    """
    variant_id = line.get('variant_id')
    quantity = line.get('quantity')

    if variant_id is None:
        raise ReviewPayloadValidationError(
            'Une ligne `stock` doit désigner une variante.'
        )
    if quantity is None or quantity <= 0:
        raise ReviewPayloadValidationError(
            'Une ligne `stock` doit avoir une quantité strictement positive.'
        )

    variant = variants_by_id.get(str(variant_id))
    if variant is None:
        # Volontairement identique aux autres cas d'échec de sécurité :
        # ne pas révéler l'existence dans une autre boutique.
        raise ReviewPayloadValidationError(
            'Variante invalide ou inaccessible pour cette boutique.'
        )
    if variant.shop_id != shop_id or variant.product.shop_id != shop_id:
        raise ReviewPayloadValidationError(
            'Variante invalide ou inaccessible pour cette boutique.'
        )
    if not variant.is_active or not variant.product.is_active:
        raise ReviewPayloadValidationError(
            'Variante invalide ou inaccessible pour cette boutique.'
        )
    if variant.product.type != 'product':
        raise ReviewPayloadValidationError(
            'Variante invalide ou inaccessible pour cette boutique.'
        )


def _validate_ignore_line(line: dict) -> None:
    """Une ligne `ignore` ne doit pas cibler de variante."""
    if line.get('variant_id') is not None:
        raise ReviewPayloadValidationError(
            'Une ligne `ignore` ne doit pas désigner de variante.'
        )


def _prefetch_variants_for_review(
    shop_id: uuid.UUID,
    lines: list[dict],
) -> dict[str, ProductVariant]:
    """Charge en un seul query les variantes cibles des lignes `stock`.

    Filtrer par `shop=shop_id` dès la query évite tout accès cross-tenant :
    une variante d'une autre boutique n'apparaîtra simplement pas dans le
    dict retourné et la ligne sera rejetée génériquement (§ IDOR).
    """
    variant_ids = {
        str(line['variant_id'])
        for line in lines
        if line.get('decision') == REVIEW_DECISION_STOCK
        and line.get('variant_id') is not None
    }
    if not variant_ids:
        return {}
    queryset = ProductVariant.objects.select_related('product').filter(
        shop_id=shop_id, pk__in=variant_ids,
    )
    return {str(variant.pk): variant for variant in queryset}


def validate_invoice_review(
    *,
    ocr_result_id: UUID,
    shop: Shop,
    user: User,
    lines: list[dict],
) -> tuple[OcrResult, bool]:
    """Fige la revue humaine d'un OcrResult (URS-044/045).

    Contrat :
    - `ocr_result_id` doit appartenir à `shop` — sinon `OcrResult.DoesNotExist`.
    - `lines` : liste de dicts Decimal-typés (le serializer a déjà rejeté
      les int/float JSON et normalisé les montants en `Decimal`).
    - `shop` provient toujours de `get_shop(request.user)`, jamais du client.

    Retourne `(result, created)` où `created=False` indique un doublon
    idempotent (même payload que la validation précédente).

    N'appelle AUCUN service stock. Aucun StockMovement n'est créé.
    """
    canonical_review = build_canonical_review(lines)

    with transaction.atomic():
        # `filter(shop=...)` avant `.get()` : garantit qu'un OcrResult d'une
        # autre boutique lève DoesNotExist plutôt qu'un 403 déguisé.
        result = (
            OcrResult.objects
            .select_for_update()
            .filter(shop=shop)
            .get(pk=ocr_result_id)
        )

        # Idempotence : retry avec exactement le même payload → 200.
        # Payload différent → conflit métier explicite.
        if result.status == OcrResult.STATUS_VALIDATED:
            existing_review = (
                result.structured_data.get('review')
                if isinstance(result.structured_data, dict) else None
            )
            if existing_review == canonical_review:
                return result, False
            raise ReviewConflictError(
                'Cette facture a déjà été validée avec un contenu différent.'
            )

        if result.status != OcrResult.STATUS_DONE:
            raise OcrResultNotReviewableError(
                f'OcrResult status={result.status} — seuls les résultats '
                'terminés (done) peuvent être validés.'
            )

        structured = result.structured_data or {}
        if not isinstance(structured, dict):
            raise ReviewPayloadValidationError(
                'Ce résultat OCR ne contient pas de facture structurée.'
            )
        invoice = structured.get('invoice')
        if not isinstance(invoice, dict) or not isinstance(invoice.get('lines'), list):
            raise ReviewPayloadValidationError(
                'Ce résultat OCR ne contient pas de facture structurée.'
            )

        expected_indices = list(range(len(invoice['lines'])))
        _check_indices_contract(expected_indices, lines)

        # Une seule requête pour toutes les variantes cibles — évite un N+1
        # et centralise le filtre multi-tenant en un point unique.
        variants_by_id = _prefetch_variants_for_review(shop.pk, lines)

        for line in lines:
            decision = line['decision']
            if decision == REVIEW_DECISION_STOCK:
                _validate_stock_line_business(
                    line, variants_by_id=variants_by_id, shop_id=shop.pk,
                )
            elif decision == REVIEW_DECISION_IGNORE:
                _validate_ignore_line(line)
            else:  # pragma: no cover — bloqué en amont par le serializer.
                raise ReviewPayloadValidationError(
                    f'Décision inconnue : {decision}.'
                )

        # Écriture atomique : on préserve intégralement ocr / invoice / matching
        # (jamais écrasés) et on ajoute exclusivement la clé `review`.
        new_structured = dict(structured)
        new_structured['review'] = canonical_review
        result.structured_data = new_structured
        result.status = OcrResult.STATUS_VALIDATED
        result.validated_by_user = user
        result.validated_at = timezone.now()
        result.save(update_fields=[
            'structured_data', 'status', 'validated_by_user',
            'validated_at', 'updated_at',
        ])
        return result, True


# ─── Entrée de stock depuis une facture (URS-045) ──────────────────────────
#
# La validation d'une facture lue est une entrée de stock multi-lignes
# (`stock.services.create_entry`) avec le fournisseur et la facture attachés.
# Dans la même transaction : les associations faites à la main sont
# mémorisées pour ce fournisseur, et l'OcrResult passe à `validated` avec sa
# revue (lignes entrées en stock, lignes ignorées).


class InvoiceAlreadyRecordedError(ValueError):
    """La facture a déjà été enregistrée dans le stock (la vue répond 409)."""


class InvoiceEntryLine(NamedTuple):
    line: EntryLine
    # Ligne de la facture lue ; `None` pour une ligne ajoutée à la main.
    invoice_line_index: int | None


def _invoice_lines(result: OcrResult) -> list[dict]:
    structured = result.structured_data
    if not isinstance(structured, dict):
        structured = {}
    invoice = structured.get('invoice')
    lines = invoice.get('lines') if isinstance(invoice, dict) else None
    if not isinstance(lines, list):
        raise ValidationError(
            {'ocr_document': ['Cette facture ne contient aucune ligne lue.']},
        )
    return [line if isinstance(line, dict) else {} for line in lines]


def _matching_lines(result: OcrResult) -> list[dict]:
    """Lignes du namespace `matching`, celles qui portent un index valide."""
    matching = (result.structured_data or {}).get('matching') or {}
    return [
        line for line in matching.get('lines') or []
        if isinstance(line, dict) and isinstance(line.get('invoice_line_index'), int)
    ]


def _automatic_associations(result: OcrResult) -> dict[int, str | None]:
    """Format associé automatiquement à chaque ligne lue (namespace `matching`)."""
    associations: dict[int, str | None] = {}
    for line in _matching_lines(result):
        association = line.get('association')
        associations[line['invoice_line_index']] = (
            str(association.get('variant_id'))
            if isinstance(association, dict) else None
        )
    return associations


def _automatically_ignored(result: OcrResult) -> set[int]:
    """Lignes lues ignorées d'office (libellé déjà ignoré chez ce fournisseur)."""
    return {
        line['invoice_line_index'] for line in _matching_lines(result)
        if line.get('ignored') is True
    }


def _remember_line(
    shop: Shop, user: User, supplier_key: str, read: dict,
    variant: ProductVariant | None,
) -> None:
    """Mémorise une ligne lue : associée à `variant`, ou ignorée (`None`)."""
    label = line_label_key(
        read.get('description'), read.get('supplier_reference'),
    )[:500]
    if label:
        SupplierLineMatch.objects.update_or_create(
            shop=shop, supplier_key=supplier_key, label_key=label,
            defaults={
                'variant': variant, 'is_ignored': variant is None,
                'created_by': user,
            },
        )


def _remember_choices(
    shop: Shop, user: User, result: OcrResult,
    lines: list[InvoiceEntryLine], ignored: list[int], invoice_lines: list[dict],
) -> None:
    """Mémorise les choix du commerçant pour les prochaines factures du fournisseur.

    - ligne associée à la main (ou autrement que l'association automatique) ;
    - ligne ignorée d'office puis rétablie : l'association remplace l'oubli ;
    - ligne ignorée : ignorée d'office la prochaine fois.
    """
    invoice = (result.structured_data or {}).get('invoice') or {}
    supplier_key = normalize_text(invoice.get('supplier_name'))[:255]
    automatic = _automatic_associations(result)
    restored = _automatically_ignored(result)
    for item in lines:
        index = item.invoice_line_index
        variant = item.line.variant
        if index is None or (
            automatic.get(index) == str(variant.pk) and index not in restored
        ):
            continue
        _remember_line(shop, user, supplier_key, invoice_lines[index], variant)
    for index in ignored:
        _remember_line(shop, user, supplier_key, invoice_lines[index], None)


def _mark_recorded(
    result: OcrResult, user: User,
    lines: list[InvoiceEntryLine], invoice_lines: list[dict],
) -> None:
    by_index = {item.invoice_line_index: item.line for item in lines}
    review = []
    for index, read in enumerate(invoice_lines):
        line = by_index.get(index)
        review.append({
            'invoice_line_index': index,
            'description': read.get('description') or '',
            'quantity': line.quantity if line else None,
            'unit_price': line.unit_purchase_price if line else None,
            'line_total': None,
            'decision': REVIEW_DECISION_STOCK if line else REVIEW_DECISION_IGNORE,
            'variant_id': line.variant.pk if line else None,
        })
    result.structured_data = {
        **result.structured_data, 'review': build_canonical_review(review),
    }
    result.status = OcrResult.STATUS_VALIDATED
    result.validated_by_user = user
    result.validated_at = timezone.now()
    result.save(update_fields=[
        'structured_data', 'status', 'validated_by_user', 'validated_at', 'updated_at',
    ])


def record_invoice_entry(
    *,
    shop: Shop,
    user: User,
    document_id: UUID,
    lines: list[InvoiceEntryLine],
    reference: EntryReference,
    ignored_line_indices: list[int] | None = None,
) -> list[StockMovement]:
    """Entrée de stock depuis une facture lue, tout ou rien.

    `ignored_line_indices` : lignes lues exclues de l'entrée (frais de port,
    remise…), ignorées d'office sur les prochaines factures du fournisseur.

    L'OcrResult est verrouillé : deux validations simultanées de la même
    facture ne peuvent pas ajouter deux fois le stock.
    """
    ignored = ignored_line_indices or []
    with transaction.atomic():
        result = (
            OcrResult.objects.select_for_update()
            .filter(shop=shop, uploaded_document_id=document_id)
            .order_by('-created_at').first()
        )
        if result is None:
            raise ValidationError({'ocr_document': ['Facture introuvable.']})
        if result.status == OcrResult.STATUS_VALIDATED:
            raise InvoiceAlreadyRecordedError(
                'Cette facture a déjà été enregistrée dans le stock.'
            )
        if result.status != OcrResult.STATUS_DONE:
            raise OcrResultNotReviewableError(
                "La lecture de cette facture n'est pas terminée."
            )
        invoice_lines = _invoice_lines(result)
        if any(
            item.invoice_line_index is not None
            and item.invoice_line_index >= len(invoice_lines)
            for item in lines
        ):
            raise ValidationError({'lines': ['Ligne de facture inconnue.']})
        if any(index >= len(invoice_lines) for index in ignored):
            raise ValidationError(
                {'ignored_line_indices': ['Ligne de facture inconnue.']},
            )
        movements = create_entry(
            shop, user, [item.line for item in lines],
            reference._replace(ocr_result=result),
        )
        _remember_choices(shop, user, result, lines, ignored, invoice_lines)
        _mark_recorded(result, user, lines, invoice_lines)
        return movements


# ─── Scan d'emballage (URS-109) ────────────────────────────────────────────
#
# Ordre des sources : code-barres, Open Food Facts, lecture du texte (structurée
# par le fournisseur IA, ou règles en repli), puis secours image. Une source
# suivante ne remplace une valeur que si elle est plus sûre (confiance
# strictement supérieure). Le nom et la description sont composés ici, avec la
# boutique en tête (sa marque n'est pas répétée) : aucune donnée de la boutique
# ne part vers ai-service ni le fournisseur. L'IA ne fait que proposer : rien
# n'est enregistré ici, hormis les compteurs mensuels (lectures avancées,
# secours image) et le journal d'audit (sources et issues, jamais le contenu lu).

SCAN_SOURCE_BARCODE = 'barcode'
SCAN_SOURCE_OPEN_FOOD_FACTS = 'open_food_facts'
SCAN_SOURCE_OCR = 'ocr'
SCAN_SOURCE_VISION = 'vision'
SCAN_FIELD_NAMES = (
    'name', 'brand', 'product_name', 'variant', 'net_quantity', 'unit_suggestion',
    'barcode', 'description',
)
SCAN_WARNING_TEXT_QUOTA = 'text_quota_reached'
SCAN_WARNING_VISION_QUOTA = 'vision_quota_reached'
SCAN_WARNING_VISION_UNAVAILABLE = 'vision_unavailable'

# Fiche publique saisie par un humain : plus sûre que l'OCR, moins qu'un code lu.
_OPEN_FOOD_FACTS_CONFIDENCE = 0.9
# Une réponse de modèle ne passe jamais devant une base publique ni un code lu.
_VISION_MAX_CONFIDENCE = 0.85
# Sources sûres du nom : le critère sémantique de l'OCR ne les concerne pas.
_TRUSTED_NAME_SOURCES = frozenset({SCAN_SOURCE_BARCODE, SCAN_SOURCE_OPEN_FOOD_FACTS})
# L'unité de vente d'un article emballé est la pièce ; jamais g/kg d'après la
# contenance (un paquet de 500 g se vend à la pièce).
_UNIT_PIECE = 'piece'
_UNIT_CONFIDENCE = 0.8
_NAME_MAX_LENGTH = 200
_DESCRIPTION_MAX_LENGTH = 300


class ScanField(NamedTuple):
    value: str
    confidence: float
    source: str


class ProductScanResult(NamedTuple):
    fields: dict[str, ScanField | None]
    warnings: list[str]


def _offer(
    found: dict[str, ScanField], key: str, value: str | None, confidence: float,
    source: str,
) -> None:
    if not value:
        return
    current = found.get(key)
    if current is None or confidence > current.confidence:
        found[key] = ScanField(value, round(confidence, 3), source)


def _claims_description(claims: list[str]) -> str | None:
    """Allégations réunies en une description ; jamais la désignation."""
    return ', '.join(claims)[:_DESCRIPTION_MAX_LENGTH] or None


def _apply_local(found: dict[str, ScanField], local: AiProductScanLocal) -> None:
    if local.barcode is not None and is_valid_gtin(local.barcode.value):
        barcode = local.barcode
        _offer(found, 'barcode', barcode.value, barcode.confidence, SCAN_SOURCE_BARCODE)
        product = lookup_barcode(barcode.value)
        if product is not None:
            for key, value in (
                ('product_name', product.name),
                ('brand', product.brand),
                ('net_quantity', product.quantity),
            ):
                _offer(
                    found, key, value, _OPEN_FOOD_FACTS_CONFIDENCE,
                    SCAN_SOURCE_OPEN_FOOD_FACTS,
                )
    for key in ('brand', 'product_name', 'variant', 'net_quantity'):
        proposal = getattr(local, key)
        if proposal is not None:
            _offer(found, key, proposal.value, proposal.confidence, SCAN_SOURCE_OCR)
    if local.claims:
        _offer(
            found, 'description', _claims_description([c.value for c in local.claims]),
            min(c.confidence for c in local.claims), SCAN_SOURCE_OCR,
        )


def _apply_vision(found: dict[str, ScanField], vision: AiProductVision) -> None:
    confidence = min(vision.confidence or 0.0, _VISION_MAX_CONFIDENCE)
    for key in ('brand', 'product_name', 'variant', 'net_quantity'):
        _offer(found, key, getattr(vision, key), confidence, SCAN_SOURCE_VISION)
    _offer(
        found, 'description', _claims_description(list(vision.claims)), confidence,
        SCAN_SOURCE_VISION,
    )
    if vision.barcode and is_valid_gtin(vision.barcode):
        _offer(found, 'barcode', vision.barcode, confidence, SCAN_SOURCE_VISION)


def _compose_name(fields: dict[str, ScanField | None], shop: Shop) -> ScanField | None:
    """Nom proposé : [marque] désignation [variante] [contenance].

    La marque n'est ajoutée en tête que si elle diffère du nom de la boutique
    (sans casse ni accent) : une boutique qui vend sa propre marque ne la
    répète pas. Une partie déjà contenue dans le nom n'est pas répétée.
    """
    product_name = fields.get('product_name')
    if product_name is None:
        return None
    name = [product_name.value]

    def is_new(part: ScanField | None) -> bool:
        # Mots entiers : la variante « Or » n'est pas « contenue » dans « Original ».
        if part is None:
            return False
        current = f' {normalize_text(" ".join(name))} '
        return f' {normalize_text(part.value)} ' not in current

    for key in ('variant', 'net_quantity'):
        part = fields.get(key)
        if is_new(part):
            name.append(part.value)
    brand = fields.get('brand')
    if is_new(brand) and normalize_text(brand.value) != normalize_text(shop.name):
        name.insert(0, brand.value)
    return ScanField(
        ' '.join(name)[:_NAME_MAX_LENGTH], product_name.confidence, product_name.source,
    )


def _suggest_unit(found: dict[str, ScanField]) -> None:
    """« Pièce » seulement si un indice sûr désigne un article emballé.

    Un code à diffusion restreinte (article pesé en magasin) ou l'absence
    d'indice : aucune unité proposée.
    """
    barcode = found.get('barcode')
    if barcode is not None:
        if is_restricted_gtin(barcode.value):
            return
        source = barcode.source
    elif 'net_quantity' in found:
        source = found['net_quantity'].source
    else:
        return
    found['unit_suggestion'] = ScanField(_UNIT_PIECE, _UNIT_CONFIDENCE, source)


def scan_quota_month(shop: Shop) -> date:
    """Premier jour du mois courant, dans le fuseau de la boutique."""
    return timezone.localdate(timezone=ZoneInfo(shop.timezone)).replace(day=1)


_ScanCounter = Literal['text_count', 'vision_count']


def _reserve_scan(
    shop: Shop, month: date, counter: _ScanCounter, limit: int | None,
) -> bool:
    """Réserve un appel payant du scan ; `False` si le plafond du mois est atteint.

    SQL atomique uniquement : la ligne du mois est créée par un INSERT … ON
    CONFLICT DO NOTHING, puis incrémentée par un UPDATE conditionnel
    (`compteur < plafond`). Deux scans simultanés ne peuvent pas dépasser le
    plafond, sans aucune lecture suivie d'une écriture. Plafond `None`
    (illimité) : l'incrément reste fait, pour la jauge d'usage.
    """
    if limit == 0:
        return False
    ProductScanUsage.objects.bulk_create(
        [ProductScanUsage(shop=shop, month=month)], ignore_conflicts=True,
    )
    usage = ProductScanUsage.objects.filter(shop=shop, month=month)
    if limit is not None:
        usage = usage.filter(**{f'{counter}__lt': limit})
    now = timezone.now()
    return usage.update(**{counter: F(counter) + 1, 'updated_at': now}) == 1


def _release_scan(shop: Shop, month: date, counter: _ScanCounter) -> None:
    """Rend un appel réservé qui n'a pas abouti (décrément atomique, jamais sous 0)."""
    ProductScanUsage.objects.filter(
        shop=shop, month=month, **{f'{counter}__gt': 0},
    ).update(**{counter: F(counter) - 1, 'updated_at': timezone.now()})


def reserve_vision_scan(shop: Shop, month: date) -> bool:
    """Réserve un secours image (`max_vision_scans_per_month`)."""
    limit = shop.effective_plan.max_vision_scans_per_month
    return _reserve_scan(shop, month, 'vision_count', limit)


def release_vision_scan(shop: Shop, month: date) -> None:
    _release_scan(shop, month, 'vision_count')


def reserve_text_scan(shop: Shop, month: date) -> bool:
    """Réserve une lecture avancée (`max_text_scans_per_month` de la formule
    effective : l'essai Boutique compte comme Boutique)."""
    limit = shop.effective_plan.max_text_scans_per_month
    return _reserve_scan(shop, month, 'text_count', limit)


def release_text_scan(shop: Shop, month: date) -> None:
    _release_scan(shop, month, 'text_count')


def _vision_needed(found: dict[str, ScanField], local: AiProductScanLocal) -> bool:
    """Désignation absente, peu sûre, ou jugée insuffisante par le critère
    sémantique d'ai-service (texte pauvre, égale à la marque, un seul mot sans
    type de produit) — sauf si elle vient d'un code lu ou d'Open Food Facts."""
    name = found.get('product_name')
    if name is None or name.confidence < settings.PRODUCT_SCAN_VISION_THRESHOLD:
        return True
    return local.vision_recommended and name.source not in _TRUSTED_NAME_SOURCES


def _vision_fallback(
    shop: Shop, found: dict[str, ScanField], local: AiProductScanLocal, face: ScanPhoto,
) -> tuple[list[str], str]:
    """(avertissements, issue du secours) — jamais d'erreur bloquante."""
    if not _vision_needed(found, local):
        return [], 'not_needed'
    if not local.vision_available:
        return [], 'disabled'
    month = scan_quota_month(shop)
    if not reserve_vision_scan(shop, month):
        return [SCAN_WARNING_VISION_QUOTA], 'quota_reached'
    try:
        vision = scan_product_vision_with_ai_service(face=face)
    except AiServiceUnavailableError:
        release_vision_scan(shop, month)
        return [SCAN_WARNING_VISION_UNAVAILABLE], 'unavailable'
    _apply_vision(found, vision)
    return [], 'used'


class _TextSlot(NamedTuple):
    """Place de lecture avancée d'un scan.

    `structure` : demander la structuration à ai-service ; `reserved` : place
    prise par cette requête (rendue si la structuration n'aboutit pas) ;
    `outcome` : `disabled`, `same_scan` (dos d'une face déjà structurée),
    `reserved` ou `quota_reached`.
    """

    structure: bool
    reserved: bool
    outcome: str


_SCAN_CACHE_ALIAS = 'product_scans'


def _face_key(shop: Shop, face: ScanPhoto) -> str:
    # Empreinte seule : ni l'image ni le texte lu ne sont gardés.
    return f'{shop.pk}:{hashlib.sha256(face.content).hexdigest()}'


def _keep_face_for_back(shop: Shop, face: ScanPhoto) -> None:
    """Face structurée : sa photo du dos, envoyée ensuite, ne prendra pas de place."""
    try:
        caches[_SCAN_CACHE_ALIAS].set(
            _face_key(shop, face), 1, settings.PRODUCT_SCAN_BACK_GRACE_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 — Redis indisponible : le dos prendra une place
        logger.warning('Product scan cache unavailable: %s', type(exc).__name__)


def _claim_face_for_back(shop: Shop, face: ScanPhoto) -> bool:
    """Reprend une seule fois (DEL atomique) la place déjà prise par la face."""
    try:
        return bool(caches[_SCAN_CACHE_ALIAS].delete(_face_key(shop, face)))
    except Exception as exc:  # noqa: BLE001 — Redis indisponible : une place est réservée
        logger.warning('Product scan cache unavailable: %s', type(exc).__name__)
        return False


def _take_text_slot(
    shop: Shop, month: date, face: ScanPhoto, back: ScanPhoto | None,
) -> _TextSlot:
    """Face et dos d'un même scan : une seule place."""
    if not settings.PRODUCT_SCAN_AI_ENABLED:
        return _TextSlot(structure=False, reserved=False, outcome='disabled')
    if back is not None and _claim_face_for_back(shop, face):
        return _TextSlot(structure=True, reserved=False, outcome='same_scan')
    if reserve_text_scan(shop, month):
        return _TextSlot(structure=True, reserved=True, outcome='reserved')
    return _TextSlot(structure=False, reserved=False, outcome='quota_reached')


def _settle_text_slot(
    shop: Shop, month: date, slot: _TextSlot, face: ScanPhoto,
    back: ScanPhoto | None, structuring: str | None,
) -> None:
    """Après l'appel (`structuring` à None : ai-service injoignable).

    Structuration non aboutie (`disabled`, `failed`, injoignable) : la place
    réservée est rendue, ou celle de la face reste disponible pour le dos.

    Limite connue : si le processus est tué entre la réservation et ce
    règlement, la place reste consommée à tort (au pire une lecture de moins
    pour la boutique, jamais un appel non compté) : accepté plutôt qu'une
    réconciliation.
    """
    if not slot.structure:
        return
    if structuring != 'done':
        if slot.reserved:
            release_text_scan(shop, month)
        else:
            _keep_face_for_back(shop, face)
    elif back is None:
        _keep_face_for_back(shop, face)


def _read_locally(
    shop: Shop, face: ScanPhoto, back: ScanPhoto | None,
) -> tuple[AiProductScanLocal, str]:
    """Lecture locale, structurée si une place de lecture avancée est libre.

    Renvoie la lecture et l'issue du texte pour le journal d'audit. Plafond
    atteint : règles locales, jamais une erreur.
    """
    month = scan_quota_month(shop)
    slot = _take_text_slot(shop, month, face, back)
    try:
        local = scan_product_locally_with_ai_service(
            face=face, back=back, structure=slot.structure,
        )
    except AiServiceUnavailableError:
        _settle_text_slot(shop, month, slot, face, back, structuring=None)
        raise
    _settle_text_slot(shop, month, slot, face, back, structuring=local.structuring)
    if slot.outcome == 'quota_reached':
        return local, 'quota_reached'
    return local, local.structuring


def scan_product_image(
    *, shop: Shop, user: User, face: ScanPhoto, back: ScanPhoto | None = None,
) -> ProductScanResult:
    """Propose les champs d'une fiche article à partir d'une ou deux photos
    d'emballage (face, dos facultatif).

    Les photos sont déjà validées (type réel, taille) et ne vivent qu'en
    mémoire : rien n'est stocké ni journalisé des images ou du texte lu. Lève
    `AiServiceUnavailableError` si la lecture locale échoue (la vue répond 503).
    """
    local, text_outcome = _read_locally(shop, face, back)
    found: dict[str, ScanField] = {}
    _apply_local(found, local)
    warnings, vision_outcome = _vision_fallback(shop, found, local, face)
    if text_outcome == 'quota_reached':
        warnings.insert(0, SCAN_WARNING_TEXT_QUOTA)
    _suggest_unit(found)
    minimum = settings.PRODUCT_SCAN_MIN_CONFIDENCE
    fields: dict[str, ScanField | None] = {
        key: field if (field := found.get(key)) and field.confidence >= minimum
        else None
        for key in SCAN_FIELD_NAMES
    }
    fields['name'] = _compose_name(fields, shop)
    log_action(
        shop_id=shop.pk, user=user, action='product_scan', model_name='ProductScan',
        obj_id=shop.pk, obj_repr="Scan d'emballage",
        changes={
            'sources': sorted({f.source for f in fields.values() if f is not None}),
            'photos': 1 if back is None else 2,
            'text': text_outcome,
            'vision': vision_outcome,
        },
    )
    return ProductScanResult(fields=fields, warnings=warnings)
