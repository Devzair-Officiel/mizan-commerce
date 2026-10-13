"""Constantes partagées du catalogue."""

DEFAULT_VARIANT_NAME = 'Par défaut'
"""Nom du format unique d'un article sans formats nommés.

Même valeur que `DEFAULT_VARIANT_NAME` côté frontend (`lib/products.ts`).
"""


def is_default_variant(name: str) -> bool:
    """Format par défaut : son nom ne s'affiche pas (cf. `isDefaultVariant`)."""
    return name == DEFAULT_VARIANT_NAME
