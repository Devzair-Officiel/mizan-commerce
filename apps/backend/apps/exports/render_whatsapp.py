"""Rendu WhatsApp d'un jeu de données : texte seul, à copier ou ouvrir dans wa.me.

Rien n'est envoyé par le serveur. Gras WhatsApp (`*…*`) pour les titres, listes
en « - », `WHATSAPP_MAX_ROWS` lignes au plus, puis le nombre de commandes restantes
et un renvoi à la liste complète en PDF ou CSV (aucun fichier n'est joint au
message). Les textes saisis (boutique, clients, recherche) perdent leurs marques
de mise en forme.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from itertools import islice

from babel.numbers import format_currency, format_decimal

from .services import COUNT, MONEY, WHATSAPP_MAX_ROWS, ExportDataset, ExportRow, format_day  # noqa: E501

_MARKS = re.compile(r'[*_~`]')


def plain(text: str) -> str:
    """Texte saisi sans `*`, `_`, `~` ni accent grave : il ne casse pas le gras."""
    return _MARKS.sub('', text)


def whatsapp_money(value: Decimal, dataset: ExportDataset) -> str:
    return format_currency(
        value, dataset.currency, locale=dataset.lang, numbering_system='latn',
    )


def _total_value(kind: str, value: int | Decimal, dataset: ExportDataset) -> str:
    if kind == MONEY:
        return whatsapp_money(value, dataset)
    if kind == COUNT:
        return format_decimal(value, locale=dataset.lang, numbering_system='latn')
    return str(value)


def _row_line(row: ExportRow, dataset: ExportDataset) -> str:
    """N°, jour, client, total, puis le paiement (le statut si la ligne est exclue)."""
    values = row.values
    created: datetime = values['created_at']
    state = values['status'] if row.excluded else values['payment']
    parts = [
        f'*{plain(values["number"])}*',
        format_day(created.astimezone(dataset.tz).date(), dataset.lang),
        plain(values['customer']),
        whatsapp_money(values['total'], dataset),
        state,
    ]
    return '- ' + ' · '.join(parts)


def _remaining(count: int, dataset: ExportDataset) -> str:
    if count == 1:
        return dataset.text('more.one')
    return dataset.text('more.other').format(count=count)


def render_whatsapp(dataset: ExportDataset) -> str:
    pair = dataset.text('pair')
    lines = [f'*{dataset.title} · {plain(dataset.shop.name)}*', dataset.period]
    if dataset.filters:
        filters = ' · '.join(plain(label) for label in dataset.filters)
        lines.append(pair.format(label=dataset.text('filters'), value=filters))
    lines += ['', f'*{dataset.text("totals")}*']
    if dataset.totals_note:
        lines.append(f'_{dataset.totals_note}_')
    lines += [
        '- ' + pair.format(
            label=dataset.text(f'total.{total.key}'),
            value=_total_value(total.kind, total.value, dataset),
        )
        for total in dataset.totals
    ]
    shown = [_row_line(row, dataset) for row in islice(dataset.rows, WHATSAPP_MAX_ROWS)]
    if shown:
        lines += ['', f'*{dataset.text("detail")}*', *shown]
    if dataset.row_count > len(shown):
        lines.append(_remaining(dataset.row_count - len(shown), dataset))
    return '\n'.join(lines)
