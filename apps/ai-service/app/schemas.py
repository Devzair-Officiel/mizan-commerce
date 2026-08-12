"""Contrat JSON exposé par les endpoints internes du service IA.

Deux surfaces distinctes :

- `extract-text` (OCR pur) : renvoie uniquement `OcrExtractionResult` — pas
  d'interprétation métier, uniquement du texte brut, sa confiance et sa
  géométrie.
- `invoice/structure` (POC 6A) : à partir de la sortie OCR, on demande à un
  LLM externe de proposer une structure de facture (`InvoiceExtraction`).
  Ce niveau reste *proposition* : aucune écriture, aucun matching produit,
  la validation humaine reste requise côté backend / frontend Mizan.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class OcrLine(BaseModel):
    """Une ligne détectée par l'OCR : texte + confiance + géométrie.

    La `bbox` conserve la position pixel de la ligne dans l'image source,
    format `[x_min, y_min, x_max, y_max]`. Utile côté backend pour deux
    usages à venir :
    - regrouper les lignes en tableaux (mêmes bandes horizontales) ;
    - surligner la zone dans la relecture humaine.

    Reste optionnel car certaines versions de PaddleOCR peuvent ne pas
    renvoyer `rec_boxes` (fallback silencieux → `bbox = []`).
    """

    text: str = Field(description='Texte reconnu sur la ligne.')
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description='Confiance du moteur OCR sur cette ligne, entre 0 et 1.',
    )
    bbox: list[int] = Field(
        default_factory=list,
        description='Boîte englobante `[x_min, y_min, x_max, y_max]` en pixels, ou liste vide.',
    )


class OcrExtractionResult(BaseModel):
    """Sortie du pipeline OCR pour un document image.

    - `raw_text` : concaténation lisible des lignes détectées (séparateur `\\n`).
    - `lines`    : détail par ligne, conserve la confiance atomique.
    - `confidence_score` : moyenne arithmétique des confiances de `lines`, ou
      `0.0` si aucune ligne n'est détectée (choix explicite : évite d'exposer
      un score conventionnel type `None` qui casserait le contrat côté
      Django et empêcherait tout tri/seuil ultérieur).
    """

    raw_text: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    lines: list[OcrLine]


# ─── Extraction structurée d'une facture (POC 6A) ──────────────────────────
#
# Contrat d'entrée du LLM : uniquement le texte OCR et ses métadonnées de
# reconnaissance. Le service n'envoie *rien* d'autre au provider externe
# (pas d'`object_key`, pas d'identifiant boutique, pas de contenu DB, pas
# de credentials — voir `invoice_extraction.py`).


class InvoiceStructureRequest(BaseModel):
    """Payload d'entrée de `POST /internal/invoice/structure`.

    Volontairement identique en forme à `OcrExtractionResult` : le backend
    peut relayer tel quel le résultat de l'endpoint OCR sans transformation
    intermédiaire. `confidence_score` est absent : il est global à l'OCR et
    n'apporte rien au LLM au niveau document.
    """

    raw_text: str = Field(description='Concaténation ligne à ligne du texte OCR.')
    lines: list[OcrLine] = Field(
        description='Détail OCR ligne par ligne (texte, confiance, bbox).',
    )


class InvoiceLineExtraction(BaseModel):
    """Une ligne produit proposée par le LLM à partir de l'OCR.

    Toutes les valeurs monétaires et quantités sont exposées en `str` (JSON
    string décimal) et jamais en `float` : la précision décimale d'une
    facture ne tolère aucune arrondi binaire. Le backend Django convertira
    en `Decimal` après validation humaine.

    `source_line_indices` renvoie vers les indices (0-based) des lignes OCR
    de `InvoiceStructureRequest.lines` réellement utilisées pour composer
    cette ligne — indispensable pour la revue humaine et le surlignage.
    """

    description: str = Field(description='Libellé produit visible sur la facture.')
    supplier_reference: str | None = Field(
        default=None,
        description="Référence fournisseur (SKU, code article, EAN) si présente, sinon null.",
    )
    quantity: str | None = Field(
        default=None,
        description='Quantité en notation décimale (point), ou null si absente.',
    )
    unit_price: str | None = Field(
        default=None,
        description='Prix unitaire en notation décimale (point), ou null si absent.',
    )
    line_total: str | None = Field(
        default=None,
        description='Total de la ligne en notation décimale (point), ou null si absent.',
    )
    source_line_indices: list[int] = Field(
        default_factory=list,
        description='Indices (0-based) des lignes OCR utilisées pour cette ligne.',
    )


class InvoiceExtraction(BaseModel):
    """Contrat de sortie du LLM — proposition de structure de facture.

    Chaque champ scalaire est nullable : le LLM DOIT renvoyer `null` plutôt
    que d'inventer une valeur absente du document. Les montants et la date
    restent des `str` : ils seront convertis / re-vérifiés en `Decimal` et
    `date` par le validateur déterministe côté service.

    `warnings` remonte les incohérences détectées par la validation
    déterministe (ex. `quantity * unit_price != line_total`) sans jamais
    modifier les valeurs — la revue humaine tranche.
    """

    supplier_name: str | None = Field(
        default=None,
        description='Raison sociale du fournisseur telle qu\'écrite sur le document, ou null.',
    )
    invoice_number: str | None = Field(
        default=None,
        description='Numéro de facture tel qu\'écrit sur le document, ou null.',
    )
    invoice_date: str | None = Field(
        default=None,
        description='Date de facture au format ISO YYYY-MM-DD si identifiable, sinon null.',
    )
    currency: str | None = Field(
        default=None,
        description='Code devise court (ex. EUR, USD, MAD) si identifiable, sinon null.',
    )
    subtotal: str | None = Field(
        default=None,
        description='Sous-total HT si présent, en notation décimale (point), sinon null.',
    )
    tax_amount: str | None = Field(
        default=None,
        description='Montant total de TVA si présent, en notation décimale (point), sinon null.',
    )
    total: str | None = Field(
        default=None,
        description='Total à payer si présent, en notation décimale (point), sinon null.',
    )
    lines: list[InvoiceLineExtraction] = Field(
        default_factory=list,
        description='Lignes produits proposées, liste vide si aucune ligne fiable.',
    )
    warnings: list[str] = Field(
        default_factory=list,
        description='Avertissements de la validation déterministe (incohérences non corrigées).',
    )
