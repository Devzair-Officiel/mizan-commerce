"""Matching déterministe des lignes de facture OCR vers les ProductVariant.

Objectif : à partir d'une facture structurée (`AiInvoiceExtraction`), associer
chaque ligne facture à un `ProductVariant` de la boutique courante, dans cet
ordre : code-barres, référence, association déjà mémorisée pour ce fournisseur
(`SupplierLineMatch`), puis nom normalisé. Une ligne sans association unique
reste « à associer ». Une ligne déjà ignorée chez ce fournisseur (frais
de port, remise…) est marquée `ignored` ; son association et ses candidats
restent calculés, pour pouvoir la rétablir. En complément, chaque ligne
reçoit une liste ordonnée de candidats (suggestions pour l'association à la
main).

Rien n'est ajouté au stock ici : l'entrée de stock validée par le commerçant
reste la seule écriture.

Le service ne contacte AUCUN service externe :
- pas d'appel LLM
- pas d'appel HTTP
- pas de mutation ORM
- pas d'écriture stock

Isolation multi-tenant STRICTE : seuls les variants du `shop_id` courant,
actifs, dont le produit parent est actif et de type `'product'`. Les
`services` (Product.type == 'service') n'ont pas de stock physique à faire
correspondre à une facture fournisseur.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from typing import TYPE_CHECKING, NamedTuple

from apps.products.models import ProductVariant

from .models import SupplierLineMatch

if TYPE_CHECKING:
    from uuid import UUID

    from .ai_client import AiInvoiceExtraction, AiInvoiceLine


logger = logging.getLogger(__name__)


__all__ = (
    'MAX_CANDIDATES_PER_LINE',
    'MIN_NAME_SIMILARITY',
    'InvoiceMatchingResult',
    'MatchedInvoiceLine',
    'VariantCandidate',
    'line_label_key',
    'match_invoice_lines_to_variants',
    'normalize_text',
)


# Seuil minimal pour qu'une similarité de nom soit retenue comme candidat.
# En-dessous, la ressemblance est trop faible pour justifier une revue humaine.
MIN_NAME_SIMILARITY = 70

# Plafond de candidats par ligne : au-delà, l'UI devient bruitée et la revue
# humaine perd son sens (le commerçant scannerait une liste, pas un top).
MAX_CANDIDATES_PER_LINE = 3

# Constantes des `match_kind` — évite d'éparpiller des strings libres.
_KIND_BARCODE = 'barcode_exact'
_KIND_SKU = 'sku_exact'
_KIND_NAME = 'name_similarity'
_KIND_MEMORY = 'supplier_memory'
_KIND_NAME_EXACT = 'name_exact'
_KIND_CHOICES: tuple[str, ...] = (
    _KIND_BARCODE, _KIND_SKU, _KIND_NAME, _KIND_MEMORY, _KIND_NAME_EXACT,
)

# Rang de priorité utilisé pour le tri stable. Plus le rang est bas, plus le
# candidat remonte : barcode > sku > nom.
_KIND_RANK = {
    _KIND_BARCODE: 0,
    _KIND_SKU: 1,
    _KIND_NAME: 2,
}

# Toute ponctuation devient un espace : "Article #1" comparera identiquement
# à "Article 1". `\w` en mode UNICODE conserve lettres/chiffres/accents.
_PUNCTUATION_RE = re.compile(r'[^\w]+', flags=re.UNICODE)
_WHITESPACE_RE = re.compile(r'\s+')


class VariantCandidate(NamedTuple):
    variant_id: str
    product_id: str
    product_name: str
    packaging_name: str
    match_kind: str
    # Score ALGORITHMIQUE 0..100 — pure comparaison de chaînes,
    # PAS une confiance IA.
    similarity_score: int


class MatchedInvoiceLine(NamedTuple):
    invoice_line_index: int
    candidates: list[VariantCandidate]
    # Association déterministe (unique) ; `None` : ligne « à associer ».
    association: VariantCandidate | None = None
    # Ignorée d'office : ce libellé a déjà été ignoré chez ce fournisseur.
    ignored: bool = False


class InvoiceMatchingResult(NamedTuple):
    lines: list[MatchedInvoiceLine]


class _NormalizedVariant(NamedTuple):
    """Variante enrichie des formes normalisées de ses champs comparables.

    Précalculé une fois par matching pour éviter O(lignes × variants)
    normalisations redondantes.
    """
    variant: ProductVariant
    barcode: str
    sku: str
    name: str
    name_plus_packaging: str
    # Seul format actif de son article : le nom seul suffit à l'associer.
    only_format: bool


def normalize_text(value: str | None) -> str:
    """Forme normalisée publique (clés de `SupplierLineMatch`)."""
    return _normalize_text(value)


def line_label_key(description: str | None, supplier_reference: str | None) -> str:
    """Clé du libellé d'une ligne : sa description, à défaut sa référence."""
    return _normalize_text(description) or _normalize_text(supplier_reference)


def _normalize_text(value: str | None) -> str:
    """Normalisation robuste pour comparaison de chaînes.

    - strip
    - casefold (plus complet que `str.lower` pour i18n)
    - décomposition Unicode NFKD → suppression des marques combinantes
      (accents, cédilles, etc.)
    - ponctuation → espace (chiffres et lettres conservés)
    - espaces multiples → espace unique

    Retourne `''` pour `None` ou chaîne vide — on utilise ensuite l'égalité
    stricte pour les exact matches, ce qui empêche `''` de matcher `''`
    (les callers testent explicitement la vacuité avant de comparer).
    """
    if not value:
        return ''
    normalized = unicodedata.normalize('NFKD', value).strip().casefold()
    without_marks = ''.join(
        c for c in normalized if not unicodedata.combining(c)
    )
    depunctuated = _PUNCTUATION_RE.sub(' ', without_marks)
    return _WHITESPACE_RE.sub(' ', depunctuated).strip()


def _similarity_score(a: str, b: str) -> int:
    """Score entier 0..100 basé sur `difflib.SequenceMatcher.ratio()`."""
    if not a or not b:
        return 0
    ratio = SequenceMatcher(None, a, b).ratio()
    return round(ratio * 100)


def _score_name(description_norm: str, variant: _NormalizedVariant) -> int:
    """Meilleur score entre description ↔ (name) et description ↔ (name+packaging).

    Comparer avec les deux formes évite qu'une description qui précise le
    packaging ("Farine T65 sac 5kg") soit systématiquement défavorisée face à
    un produit dont le nom seul est court ("Farine T65").
    """
    return max(
        _similarity_score(description_norm, variant.name),
        _similarity_score(description_norm, variant.name_plus_packaging),
    )


def _candidate_from_variant(
    normalized: _NormalizedVariant, kind: str, score: int,
) -> VariantCandidate:
    v = normalized.variant
    return VariantCandidate(
        variant_id=str(v.pk),
        product_id=str(v.product_id),
        product_name=v.product.name,
        packaging_name=v.packaging_name,
        match_kind=kind,
        similarity_score=score,
    )


def _match_line(
    invoice_line: AiInvoiceLine,
    variants: list[_NormalizedVariant],
) -> list[VariantCandidate]:
    """Applique la cascade barcode → sku → nom sur une ligne de facture.

    Un même `variant_id` ne peut apparaître qu'une seule fois : la première
    correspondance (selon l'ordre de priorité) est conservée.

    IMPORTANT : `supplier_reference` sert UNIQUEMENT à générer/ranker des
    candidats — jamais à être écrite dans `variant.sku` ni `variant.barcode`.
    L'égalité SKU/barcode ne *valide* jamais la correspondance : la revue
    humaine reste requise.
    """
    description_norm = _normalize_text(invoice_line.description)
    supplier_ref_norm = _normalize_text(invoice_line.supplier_reference)

    # dict {variant_pk: VariantCandidate} — la première occurrence gagne
    # (ordre barcode → sku → nom garanti par le parcours ci-dessous).
    picked: dict[object, VariantCandidate] = {}

    # 1) Barcode exact — uniquement si supplier_reference présent.
    if supplier_ref_norm:
        for norm in variants:
            if norm.variant.pk in picked:
                continue
            if norm.barcode and norm.barcode == supplier_ref_norm:
                picked[norm.variant.pk] = _candidate_from_variant(
                    norm, _KIND_BARCODE, 100,
                )

    # 2) SKU exact — uniquement si supplier_reference présent.
    if supplier_ref_norm:
        for norm in variants:
            if norm.variant.pk in picked:
                continue
            if norm.sku and norm.sku == supplier_ref_norm:
                picked[norm.variant.pk] = _candidate_from_variant(
                    norm, _KIND_SKU, 100,
                )

    # 3) Similarité de nom — seuil `MIN_NAME_SIMILARITY`.
    if description_norm:
        for norm in variants:
            if norm.variant.pk in picked:
                continue
            score = _score_name(description_norm, norm)
            if score >= MIN_NAME_SIMILARITY:
                picked[norm.variant.pk] = _candidate_from_variant(
                    norm, _KIND_NAME, score,
                )

    # Tri déterministe :
    #   1. rang(kind) croissant (barcode > sku > nom)
    #   2. score décroissant
    #   3. variant_id lexicographique (tie-break stable et reproductible)
    ordered = sorted(
        picked.values(),
        key=lambda c: (_KIND_RANK[c.match_kind], -c.similarity_score, c.variant_id),
    )
    return ordered[:MAX_CANDIDATES_PER_LINE]


def _unique(found: list[_NormalizedVariant], kind: str) -> VariantCandidate | None:
    return _candidate_from_variant(found[0], kind, 100) if len(found) == 1 else None


def _associate_line(
    invoice_line: AiInvoiceLine,
    variants: list[_NormalizedVariant],
    memory: dict[str, _NormalizedVariant],
) -> VariantCandidate | None:
    """Association unique : code-barres, référence, mémoire fournisseur, nom.

    Un niveau qui trouve plusieurs formats n'associe pas (ambiguïté) : on passe
    au suivant, puis la ligne reste « à associer ».
    """
    reference = _normalize_text(invoice_line.supplier_reference)
    if reference:
        for kind, attr in ((_KIND_BARCODE, 'barcode'), (_KIND_SKU, 'sku')):
            found = [v for v in variants if getattr(v, attr) == reference]
            if association := _unique(found, kind):
                return association
    remembered = memory.get(
        line_label_key(invoice_line.description, invoice_line.supplier_reference),
    )
    if remembered is not None:
        return _candidate_from_variant(remembered, _KIND_MEMORY, 100)
    description = _normalize_text(invoice_line.description)
    if not description:
        return None
    found = [
        v for v in variants
        if description == v.name_plus_packaging
        or (v.only_format and description == v.name)
    ]
    return _unique(found, _KIND_NAME_EXACT)


class _SupplierMemory(NamedTuple):
    # Libellé → format associé (formats éligibles seulement).
    associations: dict[str, _NormalizedVariant]
    # Libellés ignorés chez ce fournisseur.
    ignored: set[str]


def _supplier_memory(
    shop_id: UUID,
    supplier_name: str | None,
    variants: list[_NormalizedVariant],
) -> _SupplierMemory:
    """Associations et lignes ignorées mémorisées pour ce fournisseur."""
    by_pk = {str(v.variant.pk): v for v in variants}
    rows = SupplierLineMatch.objects.filter(
        shop_id=shop_id, supplier_key=_normalize_text(supplier_name),
    ).values_list('label_key', 'variant_id', 'is_ignored')
    return _SupplierMemory(
        associations={
            label: by_pk[str(variant_id)]
            for label, variant_id, ignored in rows
            if not ignored and str(variant_id) in by_pk
        },
        ignored={label for label, _variant_id, ignored in rows if ignored},
    )


def match_invoice_lines_to_variants(
    *,
    shop_id: UUID,
    extraction: AiInvoiceExtraction,
) -> InvoiceMatchingResult:
    """Retourne les candidats ProductVariant pour chaque ligne facture.

    Isolation multi-tenant :
    - filtre `shop_id` sur `ProductVariant` ET sur `product__shop_id`
      (défense en profondeur : si un jour une routine crée un variant avec
      un shop désaligné du product parent, on ne l'exfiltre pas ici) ;
    - variants inactifs exclus ;
    - products inactifs exclus ;
    - products `type='service'` exclus (pas de stock physique à matcher).
    """
    variants_qs = (
        ProductVariant.objects
        .select_related('product')
        .filter(
            shop_id=shop_id,
            product__shop_id=shop_id,
            is_active=True,
            product__is_active=True,
            product__type='product',
        )
    )
    variants = list(variants_qs)
    formats_per_product = Counter(v.product_id for v in variants)
    normalized = [
        _NormalizedVariant(
            variant=v,
            barcode=_normalize_text(v.barcode),
            sku=_normalize_text(v.sku),
            name=_normalize_text(v.product.name),
            name_plus_packaging=_normalize_text(
                f'{v.product.name} {v.packaging_name}'
            ),
            only_format=formats_per_product[v.product_id] == 1,
        )
        for v in variants
    ]
    memory = _supplier_memory(shop_id, extraction.supplier_name, normalized)

    lines = [
        MatchedInvoiceLine(
            invoice_line_index=index,
            candidates=_match_line(invoice_line, normalized),
            association=_associate_line(
                invoice_line, normalized, memory.associations,
            ),
            ignored=line_label_key(
                invoice_line.description, invoice_line.supplier_reference,
            ) in memory.ignored,
        )
        for index, invoice_line in enumerate(extraction.lines)
    ]
    return InvoiceMatchingResult(lines=lines)
