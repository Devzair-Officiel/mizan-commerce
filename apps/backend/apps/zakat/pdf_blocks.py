"""Blocs du justificatif zakat : verdict, calcul, hors base, choix d'avis, limites.

Chaque montant vient de `compute_totals` ou de la fiche : rien n'est recalculé ici.
"""
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from babel.dates import format_date
from babel.numbers import format_percent
from reportlab.platypus import KeepTogether, Spacer, Table

from apps.invoices.pdf_style import BORDER, INK, MUTED, WIDTH, PdfStyle, table, xml
from .models import ZakatCalculation, ZakatProfile
from .services import (
    SCOPE_PERSONAL,
    TOTALS_ABOVE_NISAB,
    TOTALS_BELOW_NISAB,
    TOTALS_CHOICE_MISSING,
    ZakatTotals,
)

# Ordre de l'écran (`CHOICE_ORDER` côté frontend).
CHOICE_ORDER = (
    'nisab_method', 'calendar', 'stock_valuation', 'receivables_mode', 'debts_mode',
)
AMOUNT_WIDTH = 130
OP_WIDTH = 18

# Une ligne du calcul : opération, libellé, précision, montant, ton (somme, total).
Row = tuple[str, str, str | None, str, str | None]


def _amount(style: PdfStyle, value: Decimal | str | None) -> str:
    return '—' if value is None else style.money(value)


def _percent(style: PdfStyle, value: Decimal) -> str:
    return format_percent(
        value.normalize(), locale=style.language, decimal_quantization=False,
    )


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def _verdict_text(style: PdfStyle, totals: ZakatTotals) -> str:
    text = style.text(f'verdict.{totals.status}.text')
    if totals.status == TOTALS_CHOICE_MISSING:
        names = [
            _lower_first(style.text(f'choice.{name}')) for name in totals.missing_choices  # noqa: E501
        ] + [
            _lower_first(style.text(f'scope_missing.{name}')) for name in totals.missing_scopes  # noqa: E501
        ]
        return text.format(choices=', '.join(names))
    return text.format(
        base=_amount(style, totals.nisab_compared_amount),
        threshold=_amount(style, totals.nisab_threshold),
    )


def verdict(style: PdfStyle, calc: ZakatCalculation, totals: ZakatTotals) -> Table:
    """Verdict, puis la zakat à verser maintenant et à l'encaissement des créances."""
    computed = totals.status in (TOTALS_ABOVE_NISAB, TOTALS_BELOW_NISAB)
    amounts = [(style.text('zakat_now'), totals.zakat_now)]
    mode = (calc.choices_snapshot or {}).get('receivables_mode')
    if mode == ZakatProfile.RECEIVABLES_ON_COLLECTION:
        amounts.append((style.text('zakat_on_collection'), totals.zakat_on_collection))
    rows = [
        [
            style.paragraph(xml(label)),
            style.paragraph(
                xml(_amount(style, value) if computed else style.text('not_computed')),
                size=13.5 if index == 0 else 9.75,
                bold=True,
                align=2,
            ),
        ]
        for index, (label, value) in enumerate(amounts)
    ]
    content = [
        style.paragraph(
            xml(style.text(f'verdict.{totals.status}')),
            size=13.5,
            bold=True,
            color=style.accent,
        ),
        Spacer(1, 4),
        style.paragraph(xml(_verdict_text(style, totals)), color=MUTED),
        Spacer(1, 8),
        table(rows, [WIDTH - 24 - 150, 150], padding=3),
    ]
    return table(
        [[content]],
        [WIDTH],
        padding=12,
        cornerRadii=[9] * 4,
        commands=[('BACKGROUND', (0, 0), (-1, -1), style.tint)],
    )


def _personal_note(style: PdfStyle, amount: Decimal | None) -> str | None:
    """« Dont personnelles : X » quand des lignes personnelles (sans part) comptent."""
    if not amount:
        return None
    return style.text('personal_note').format(amount=style.money(amount))


def _notes(*notes: str | None) -> str | None:
    return ' '.join(note for note in notes if note) or None


def _debts_personal(totals: ZakatTotals, mode: str) -> Decimal | None:
    if mode == ZakatProfile.DEBTS_ALL:
        return totals.debts_total_personal
    if mode == ZakatProfile.DEBTS_WITHIN_12_MONTHS:
        return totals.debts_within_12_months_personal
    return None


def _asset_rows(style: PdfStyle, calc: ZakatCalculation, totals: ZakatTotals) -> list[Row]:  # noqa: E501
    choices = calc.choices_snapshot or {}
    valuation = choices.get('stock_valuation') or 'missing'
    mode = choices.get('receivables_mode')
    receivables_note = _notes(
        _personal_note(style, totals.receivables_sure_personal),
        style.text('receivables.on_collection')
        if mode == ZakatProfile.RECEIVABLES_ON_COLLECTION
        else None,
    )
    rows: list[Row] = [
        ('+', style.text('cash'), None, _amount(style, totals.cash), None),
        ('+', style.text(f'stock.{valuation}'), None, _amount(style, totals.stock), None),  # noqa: E501
        (
            '+', style.text('receivables'), receivables_note,
            _amount(style, totals.receivables_sure), None,
        ),
    ]
    counted = [asset for asset in calc.other_assets or [] if asset.get('counted')]
    rows += [
        (
            '+', style.text('other_asset').format(label=asset.get('label', '')), None,
            _amount(style, asset.get('amount', '0')), None,
        )
        for asset in counted
    ]
    if not counted:
        rows.append(('+', style.text('other_none'), None, _amount(style, '0'), None))
    debts = choices.get('debts_mode') or 'missing'
    rows.append((
        '−', style.text(f'debts.{debts}'),
        _personal_note(style, _debts_personal(totals, debts)),
        _amount(style, totals.debts_deducted), None,
    ))
    return rows


def _price_note(style: PdfStyle, calc: ZakatCalculation) -> str:
    choices = calc.choices_snapshot or {}
    price = choices.get('nisab_unit_price')
    if not price:
        return style.text('threshold_price_missing')
    updated = choices.get('nisab_price_updated_at')
    if not updated:
        return style.text('threshold_price_undated').format(price=style.money(price))
    day = datetime.fromisoformat(updated).astimezone(ZoneInfo(calc.shop.timezone))
    return style.text('threshold_price').format(
        price=style.money(price),
        date=format_date(day.date(), format='long', locale=style.language),
    )


def _base_rows(style: PdfStyle, calc: ZakatCalculation, totals: ZakatTotals) -> list[Row]:  # noqa: E501
    choices = calc.choices_snapshot or {}
    method = choices.get('nisab_method') or 'missing'
    calendar = choices.get('calendar') or 'missing'
    rate = '—' if totals.rate is None else _percent(style, totals.rate)
    return [
        ('=', style.text('base'), None, _amount(style, totals.nisab_compared_amount), 'sum'),  # noqa: E501
        (
            '', style.text(f'threshold.{method}'), _price_note(style, calc),
            _amount(style, totals.nisab_threshold), None,
        ),
        (
            '', style.text('share'), style.text('share_text'),
            _percent(style, totals.ownership_share / 100), None,
        ),
        ('×', style.text(f'rate.{calendar}'), None, rate, None),
        ('=', style.text('zakat_total'), None, _amount(style, totals.zakat_total), 'total'),  # noqa: E501
    ]


def _render_row(style: PdfStyle, row: Row) -> list:
    op, label, note, value, tone = row
    bold = tone is not None
    color = style.accent if tone == 'total' else INK
    cell = [style.paragraph(xml(label), bold=bold, color=color)]
    if note:
        cell.append(style.paragraph(xml(note), size=8.5, color=MUTED))
    return [
        style.paragraph(xml(op), bold=True, color=MUTED, align=1),
        cell,
        style.paragraph(xml(value), bold=bold, color=color, align=2),
    ]


def calculation(style: PdfStyle, calc: ZakatCalculation, totals: ZakatTotals) -> list:
    rows = _asset_rows(style, calc, totals) + _base_rows(style, calc, totals)
    lines = [
        command
        for index, row in enumerate(rows)
        for command in (
            [('LINEABOVE', (0, index), (-1, index), 0.6, BORDER)] if row[4] else []
        )
    ]
    return [
        style.heading('calculation'),
        Spacer(1, 4),
        table(
            [_render_row(style, row) for row in rows],
            [OP_WIDTH, WIDTH - OP_WIDTH - AMOUNT_WIDTH, AMOUNT_WIDTH],
            padding=4,
            commands=[
                ('LINEBELOW', (0, 0), (-1, -1), 0.3, BORDER),
                ('BACKGROUND', (0, -1), (-1, -1), style.tint),
                *lines,
            ],
        ),
    ]


def _outside_row(style: PdfStyle, title: str, text: str, amount: str) -> list:
    return [
        [
            style.paragraph(xml(title), bold=True),
            style.paragraph(xml(text), size=8.5, color=MUTED),
        ],
        style.paragraph(xml(amount), align=2),
    ]


def outside(style: PdfStyle, calc: ZakatCalculation) -> list:
    """Créances douteuses et biens non comptés, à la valeur de la fiche ; biens d'usage."""  # noqa: E501
    rows = [
        _outside_row(
            style,
            style.text('outside_doubtful').format(label=item.get('label', ''))
            + (style.text('personal_suffix') if item.get('scope') == SCOPE_PERSONAL else ''),  # noqa: E501
            style.text('outside_doubtful_text'),
            _amount(style, item.get('amount', '0')),
        )
        for item in calc.receivable_items or []
        if item.get('doubtful')
    ]
    rows += [
        _outside_row(
            style, asset.get('label', ''), style.text('outside_not_counted_text'),
            _amount(style, asset.get('amount', '0')),
        )
        for asset in calc.other_assets or []
        if not asset.get('counted')
    ]
    rows.append(
        _outside_row(
            style, style.text('outside_usage'), style.text('outside_usage_text'), '—',
        )
    )
    return [
        style.heading('outside'),
        style.paragraph(xml(style.text('outside_hint')), size=8.5, color=MUTED),
        Spacer(1, 4),
        table(
            rows,
            [WIDTH - AMOUNT_WIDTH, AMOUNT_WIDTH],
            padding=4,
            commands=[('LINEBELOW', (0, 0), (-1, -1), 0.3, BORDER)],
        ),
    ]


def _choice_row(style: PdfStyle, name: str, value: str | None) -> list:
    if value:
        option = [
            style.paragraph(xml(style.text(f'option.{name}.{value}')), bold=True),
            style.paragraph(xml(style.text(f'who.{name}.{value}')), size=8.5, color=MUTED),  # noqa: E501
        ]
    else:
        option = [style.paragraph(xml(style.text('choice_missing')), bold=True)]
    return [style.paragraph(xml(style.text(f'choice.{name}')), color=MUTED), option]


def choices(style: PdfStyle, calc: ZakatCalculation) -> list:
    """Les choix d'avis de la fiche, avec ceux qui les retiennent (référentiel § 4)."""
    snapshot = calc.choices_snapshot or {}
    return [
        style.heading('choices'),
        style.paragraph(xml(style.text('choices_hint')), size=8.5, color=MUTED),
        Spacer(1, 4),
        table(
            [_choice_row(style, name, snapshot.get(name)) for name in CHOICE_ORDER],
            [150, WIDTH - 150],
            padding=4,
            commands=[('LINEBELOW', (0, 0), (-1, -1), 0.3, BORDER)],
        ),
    ]


def limits(style: PdfStyle) -> KeepTogether:
    """Limites du référentiel (§ 6), puis la mention d'estimation."""
    bullets = [
        [
            style.paragraph('•', size=9, color=MUTED),
            style.paragraph(xml(style.text(key)), size=9, color=MUTED),
        ]
        for key in ('limit.personal', 'limit.partners', 'limit.real_estate')
    ]
    return KeepTogether(
        [
            style.heading('limits'),
            Spacer(1, 4),
            table(bullets, [10, WIDTH - 10], padding=1),
            Spacer(1, 6),
            style.paragraph(xml(style.text('estimate')), bold=True),
        ]
    )
