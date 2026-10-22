"""Garde-fou des fichiers ouverts dans un tableur (exports CSV)."""

# Caractères qui font d'une cellule une formule pour un tableur.
FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def spreadsheet_safe(value: str | None) -> str:
    """Texte saisi : une formule de tableur en tête (=, +, -, @) est neutralisée."""
    value = value or ''
    return f"'{value}" if value[:1] in FORMULA_PREFIXES else value
