"""Justificatif PDF d'une fiche de zakat (URS-036), à tout moment, brouillon compris.

Tiré de `compute_totals` et de la fiche, jamais recalculé. Polices, couleurs et blocs
des factures (`apps.invoices.pdf_style`). Langue du compte : fr ou en ; un compte en
arabe reçoit le français (dette « factures PDF en arabe »).
"""
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo

from babel.dates import format_date, format_time
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from apps.invoices.pdf_style import (
    MUTED,
    WIDTH,
    NumberedCanvas,
    PdfStyle,
    register_fonts,
    xml,
)
from . import date_texts, hawl
from .models import ZakatCalculation
from .pdf_blocks import calculation, choices, limits, outside, verdict
from .pdf_labels import LABELS
from .services import compute_totals


def pdf_language(user: Any) -> str:
    return 'en' if user.language == 'en' else 'fr'


def pdf_title(style: PdfStyle, calc: ZakatCalculation) -> str:
    year = str(calc.hawl_year)
    if calc.hawl_calendar == hawl.CALENDAR_HIJRI:
        year = style.text('year_hijri').format(year=calc.hawl_year)
    return style.text('title').format(year=year)


def _footer(style: PdfStyle, calc: ZakatCalculation, title: str) -> Paragraph:
    parts = [style.text('estimate'), calc.shop.name, title]
    return style.paragraph(xml(' · '.join(parts)), size=8.25, color=MUTED, align=1)


def _header(style: PdfStyle, calc: ZakatCalculation, title: str) -> list:
    """Titre, boutique, personne, jour J (grégorien et hégirien), date de l'état."""
    day = calc.reference_date
    hijri = date_texts.hijri_text(day, style.language)
    dates = date_texts.gregorian_text(day, style.language)
    if hijri:
        dates += f' · {hijri}'
    zone = ZoneInfo(calc.shop.timezone)
    updated = calc.updated_at.astimezone(zone)
    state = style.text('state_at').format(
        date=format_date(updated.date(), format='long', locale=style.language),
        time=format_time(updated, format='short', tzinfo=zone, locale=style.language),
    )
    name = calc.user.full_name or calc.user.email
    return [
        style.paragraph(xml(title), size=20, color=style.accent, bold=True),
        Spacer(1, 9),
        style.paragraph(xml(calc.shop.name), size=13.5, bold=True),
        style.paragraph(xml(style.text('for').format(name=name)), size=9, color=MUTED),
        Spacer(1, 9),
        style.paragraph(f'{xml(style.text("hawl_day"))} <b>{xml(dates)}</b>'),
        style.paragraph(xml(state), size=8.5, color=MUTED),
    ]


def build_zakat_pdf(calc: ZakatCalculation) -> bytes:
    """PDF déterministe : même fiche, même état → mêmes octets."""
    register_fonts()
    language = pdf_language(calc.user)
    style = PdfStyle(language=language, labels=LABELS[language], currency=calc.currency)
    totals = compute_totals(calc)
    title = pdf_title(style, calc)
    buf = BytesIO()
    _, footer_height = _footer(style, calc, title).wrap(WIDTH, A4[1])
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=30,
        rightMargin=30,
        topMargin=30,
        bottomMargin=footer_height + 40,
        title=title,
        author=calc.shop.name,
        invariant=1,
    )
    story = [
        *_header(style, calc, title),
        Spacer(1, 12),
        verdict(style, calc, totals),
        Spacer(1, 14),
        *calculation(style, calc, totals),
        Spacer(1, 14),
        *outside(style, calc),
        Spacer(1, 14),
        *choices(style, calc),
        Spacer(1, 14),
        limits(style),
    ]
    doc.build(
        story,
        canvasmaker=lambda *args, **kwargs: NumberedCanvas(
            *args,
            pdf_style=style,
            footer=lambda: _footer(style, calc, title),
            footer_height=footer_height,
            **kwargs,
        ),
    )
    return buf.getvalue()
