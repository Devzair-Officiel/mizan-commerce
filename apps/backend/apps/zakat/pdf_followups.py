"""Bloc « Suivi à l'encaissement » du justificatif (lot Z4) : état des créances
différées de la fiche au jour du document, tiré de `followups.calculation_items`."""
from datetime import date

from babel.dates import format_date
from reportlab.platypus import Spacer

from apps.invoices.pdf_style import BORDER, MUTED, WIDTH, PdfStyle, table, xml
from . import followups
from .followups import FollowUpItem

AMOUNT_WIDTH = 130


def _title(style: PdfStyle, item: FollowUpItem) -> str:
    title = style.text(f'followup.{item.kind}').format(label=item.label or item.order_number or '')  # noqa: E501
    if item.scope == 'personal':
        title += style.text('personal_suffix')
    return title


def _state(style: PdfStyle, item: FollowUpItem) -> str:
    if item.state == followups.STATE_CHOICE_NEEDED:
        options = item.options or {}
        return style.text('followup_state.choice_needed').format(
            all=style.money(options['all_years']), one=style.money(options['one_year']),
        )
    if item.state == followups.STATE_NOTHING_DUE and item.below_nisab:
        return style.text('followup_state.below_nisab')
    if item.state == followups.STATE_PAID and item.paid > item.due:
        return style.text('followup_state.overpaid').format(
            paid=style.money(item.paid), due=style.money(item.due),
        )
    text = style.text(f'followup_state.{item.state}')
    if item.option and item.state != followups.STATE_IGNORED:
        text = f"{style.text(f'followup_option.{item.option}')}. {text}"
    return text


def _note(style: PdfStyle, item: FollowUpItem) -> str:
    parts = [
        style.text('followup.collected').format(
            collected=style.money(item.collected), amount=style.money(item.amount),
        ),
    ]
    if item.part is not None:
        parts.append(style.text('followup.part').format(part=style.money(item.part)))
    if item.paid > 0:
        parts.append(style.text('followup.paid').format(paid=style.money(item.paid)))
    parts.append(_state(style, item))
    return ' · '.join(parts)


def _row(style: PdfStyle, item: FollowUpItem) -> list:
    remaining = style.money(item.remaining) if item.state == followups.STATE_TO_PAY else '—'  # noqa: E501
    return [
        [
            style.paragraph(xml(_title(style, item)), bold=True),
            style.paragraph(xml(_note(style, item)), size=8.5, color=MUTED),
        ],
        style.paragraph(xml(remaining), align=2),
    ]


def followup_section(style: PdfStyle, items: list[FollowUpItem], today: date) -> list:
    """Rien tant que le jour J n'est pas passé ou sans créance différée."""
    if not items:
        return []
    header = [
        style.paragraph(xml(style.text('followup.line')), size=8.5, color=MUTED, bold=True),  # noqa: E501
        style.paragraph(
            xml(style.text('followup.remaining')), size=8.5, color=MUTED, bold=True, align=2,  # noqa: E501
        ),
    ]
    day = format_date(today, format='long', locale=style.language)
    return [
        style.heading('followups'),
        style.paragraph(
            xml(style.text('followups_hint').format(date=day)), size=8.5, color=MUTED,
        ),
        Spacer(1, 4),
        table(
            [header, *(_row(style, item) for item in items)],
            [WIDTH - AMOUNT_WIDTH, AMOUNT_WIDTH],
            padding=4,
            commands=[('LINEBELOW', (0, 0), (-1, -1), 0.3, BORDER)],
        ),
        Spacer(1, 14),
    ]
