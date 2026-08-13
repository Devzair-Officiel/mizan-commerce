"""Logique métier OCR.

Cette étape ne fait qu'ingérer une photo de facture fournisseur :
- validation légère de la signature binaire du fichier ;
- upload dans l'Object Storage privé ;
- création d'un `UploadedDocument` + d'un `OcrResult` (status=pending).

Aucun appel OCR / IA n'est déclenché ici — c'est l'objet des étapes suivantes.
"""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, NamedTuple

from django.db import transaction
from django.utils import timezone

from apps.core.storage import delete_object, upload_fileobj
from apps.products.models import ProductVariant

from .models import OcrResult, UploadedDocument

if TYPE_CHECKING:
    from uuid import UUID

    from django.core.files.uploadedfile import UploadedFile

    from apps.accounts.models import User
    from apps.shops.models import Shop


logger = logging.getLogger(__name__)


__all__ = (
    'REVIEW_SCHEMA_VERSION',
    'InvalidConfidenceScoreError',
    'InvalidFileSignatureError',
    'InvalidOcrTransitionError',
    'OcrResultNotReviewableError',
    'ReviewConflictError',
    'ReviewPayloadValidationError',
    'SupplierInvoiceUpload',
    'build_canonical_review',
    'create_supplier_invoice_upload',
    'mark_ocr_done',
    'mark_ocr_failed',
    'mark_ocr_processing',
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
    trois formats acceptés à cette étape.
    """
    # 12 octets suffisent pour distinguer JPEG / PNG / WebP.
    file.seek(0)
    header = file.read(12)
    file.seek(0)

    if declared_mime == 'image/jpeg':
        ok = header.startswith(b'\xff\xd8\xff')
    elif declared_mime == 'image/png':
        ok = header.startswith(b'\x89PNG\r\n\x1a\n')
    elif declared_mime == 'image/webp':
        ok = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
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
    """Ingère une photo de facture fournisseur.

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
        f"Transition OCR invalide : {current} → {target}."
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
            "Le payload contient des invoice_line_index dupliqués."
        )
    if set(provided_indices) != set(expected_indices):
        missing = sorted(set(expected_indices) - set(provided_indices))
        extra = sorted(set(provided_indices) - set(expected_indices))
        raise ReviewPayloadValidationError(
            "Les lignes de revue ne correspondent pas à la facture "
            f"(manquantes={missing}, en trop={extra})."
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
            "Une ligne `stock` doit désigner une variante."
        )
    if quantity is None or quantity <= 0:
        raise ReviewPayloadValidationError(
            "Une ligne `stock` doit avoir une quantité strictement positive."
        )

    variant = variants_by_id.get(str(variant_id))
    if variant is None:
        # Volontairement identique aux autres cas d'échec de sécurité :
        # ne pas révéler l'existence dans une autre boutique.
        raise ReviewPayloadValidationError(
            "Variante invalide ou inaccessible pour cette boutique."
        )
    if variant.shop_id != shop_id or variant.product.shop_id != shop_id:
        raise ReviewPayloadValidationError(
            "Variante invalide ou inaccessible pour cette boutique."
        )
    if not variant.is_active or not variant.product.is_active:
        raise ReviewPayloadValidationError(
            "Variante invalide ou inaccessible pour cette boutique."
        )
    if variant.product.type != 'product':
        raise ReviewPayloadValidationError(
            "Variante invalide ou inaccessible pour cette boutique."
        )


def _validate_ignore_line(line: dict) -> None:
    """Une ligne `ignore` ne doit pas cibler de variante."""
    if line.get('variant_id') is not None:
        raise ReviewPayloadValidationError(
            "Une ligne `ignore` ne doit pas désigner de variante."
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
                "Cette facture a déjà été validée avec un contenu différent."
            )

        if result.status != OcrResult.STATUS_DONE:
            raise OcrResultNotReviewableError(
                f'OcrResult status={result.status} — seuls les résultats '
                'terminés (done) peuvent être validés.'
            )

        structured = result.structured_data or {}
        if not isinstance(structured, dict):
            raise ReviewPayloadValidationError(
                "Ce résultat OCR ne contient pas de facture structurée."
            )
        invoice = structured.get('invoice')
        if not isinstance(invoice, dict) or not isinstance(invoice.get('lines'), list):
            raise ReviewPayloadValidationError(
                "Ce résultat OCR ne contient pas de facture structurée."
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
                    f"Décision inconnue : {decision}."
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
