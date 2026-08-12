"""Contrat JSON exposé par les endpoints OCR internes.

Volontairement minimaliste : le service IA ne fait *que* de la reconnaissance
de texte. Aucune interprétation métier (montant, référence produit, TVA…) ne
doit fuiter dans ces schemas ; c'est le rôle du backend Django, après revue
humaine, de structurer les données extraites.
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
