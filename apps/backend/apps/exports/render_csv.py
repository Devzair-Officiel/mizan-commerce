"""Rendu CSV d'un jeu de données : UTF-8 avec BOM, « ; », en flux.

En-têtes et séparateur décimal dans la langue de l'interface, comme l'export de
l'activité d'un client ; dates au fuseau de la boutique (`AAAA-MM-JJ HH:MM`),
montants et quantités sans devise ni séparateur de milliers. Pas de ligne de totaux : le
fichier reste une table que le tableur peut trier et additionner.
"""

from __future__ import annotations

import csv
from collections.abc import Iterator
from datetime import datetime
from decimal import Decimal

from babel.numbers import get_decimal_symbol

from .services import DATETIME, MONEY, QUANTITY, ExportDataset

# Caractères qui font d'une cellule une formule pour un tableur.
FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def spreadsheet_safe(value: str | None) -> str:
    """Texte saisi : une formule de tableur en tête (=, +, -, @) est neutralisée."""
    value = value or ''
    return f"'{value}" if value[:1] in FORMULA_PREFIXES else value


def csv_amount(value: Decimal | None, lang: str) -> str:
    """Montant au séparateur décimal de la langue, chiffres latins, sans milliers."""
    if value is None:
        return ''
    separator = get_decimal_symbol(lang, numbering_system='latn')
    return f'{value:.2f}'.replace('.', separator)


def csv_quantity(value: Decimal | None, lang: str) -> str:
    """Quantité sans zéros inutiles (3, 2,5, -4) : un nombre, que le tableur
    additionne ; le signe moins n'en fait pas une formule à neutraliser."""
    if value is None:
        return ''
    separator = get_decimal_symbol(lang, numbering_system='latn')
    return f'{value.normalize():f}'.replace('.', separator)


class _Echo:
    """Tampon de `csv.writer` : rend la ligne au lieu de l'écrire (réponse en flux)."""

    def write(self, value: str) -> str:
        return value


def _cell(kind: str, value: str | Decimal | datetime | None, dataset: ExportDataset) -> str:  # noqa: E501
    if kind == MONEY:
        return csv_amount(value, dataset.lang)
    if kind == QUANTITY:
        return csv_quantity(value, dataset.lang)
    if kind == DATETIME:
        return value.astimezone(dataset.tz).strftime('%Y-%m-%d %H:%M') if value else ''
    return spreadsheet_safe(value)


def render_csv(dataset: ExportDataset) -> Iterator[str]:
    """BOM, en-tête puis une ligne par enregistrement, dans l'ordre du jeu."""
    writer = csv.writer(_Echo(), delimiter=';')
    header = [dataset.text(f'column.{column.key}') for column in dataset.columns]
    yield '﻿' + writer.writerow(header)
    for row in dataset.rows:
        yield writer.writerow([
            _cell(column.kind, row.values[column.key], dataset)
            for column in dataset.columns
        ])
