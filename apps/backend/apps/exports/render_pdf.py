"""Rendu PDF d'un jeu de données : A4 ReportLab, au style des factures.

En-tête de la boutique (logo, accent, activité) et polices des factures
(`apps.invoices.pdf_style`), période, date de génération, totaux puis la table
des colonnes compactes ; « Page n sur N » en pied de page. Logo et couleur
suivent `invoice_branding`, comme une facture émise aujourd'hui. Au-delà de
`PDF_MAX_ROWS` lignes, la vue refuse avant d'arriver ici.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from babel.dates import format_date, format_time
from babel.numbers import format_decimal
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table

from apps.invoices.pdf_blocks import brand_block
from apps.invoices.pdf_style import (
    ACCENT,
    BORDER,
    INK,
    MUTED,
    STRIPE,
    TINT,
    WIDTH,
    NumberedCanvas,
    PdfStyle,
    register_fonts,
    table,
    xml,
)
from apps.invoices.settings import resolved_color
from apps.public_pages.models import PublicPage
from apps.shops.models import Shop
from apps.subscriptions.permissions import shop_has_feature

from .services import (
    COUNT, DATETIME, MONEY, QUANTITY, ExportColumn, ExportDataset, ExportRow,
    format_day,
)

CELL_SIZE = 8.25
# Nombres alignés à droite.
NUMERIC = (MONEY, QUANTITY)


@dataclass(frozen=True)
class Branding:
    color: str
    logo_key: str
    activity: str


def _branding(shop: Shop) -> Branding:
    """Couleur et logo si `invoice_branding` (sinon neutres), activité de la page."""
    branded = shop_has_feature(shop, 'invoice_branding')
    page = PublicPage.objects.filter(shop=shop).only('tagline').first()
    return Branding(
        color=resolved_color(shop) if branded else '',
        logo_key=shop.logo_object_key if branded else '',
        activity=page.tagline if page else '',
    )


def _style(dataset: ExportDataset, branding: Branding) -> PdfStyle:
    accent = colors.HexColor(branding.color) if branding.color else ACCENT
    tint = (
        colors.linearlyInterpolatedColor(accent, colors.white, 0, 1, 0.93)
        if branding.color else TINT
    )
    return PdfStyle(
        language=dataset.lang, labels={'page': dataset.text('page')},
        currency=dataset.currency, accent=accent, tint=tint,
    )


def _subject(style: PdfStyle, dataset: ExportDataset) -> list:
    """Destinataire (relevé d'un client) : nom en gras, coordonnées, puis un blanc."""
    if not dataset.subject:
        return []
    name, *details = dataset.subject
    return [
        style.paragraph(xml(name), size=11, bold=True, align=2),
        *[
            style.paragraph(xml(line), size=8.5, color=MUTED, align=2)
            for line in details
        ],
        Spacer(1, 6),
    ]


def _header(style: PdfStyle, dataset: ExportDataset, branding: Branding) -> Table:
    generated = dataset.text('generated').format(
        date=format_day(dataset.generated_at.date(), dataset.lang),
        time=format_time(dataset.generated_at, 'HH:mm', locale=dataset.lang),
    )
    right = [
        style.paragraph(xml(dataset.title), size=20, color=style.accent, bold=True, align=2),  # noqa: E501
        Spacer(1, 8),
        *_subject(style, dataset),
        style.paragraph(xml(dataset.period), align=2),
        *([style.paragraph(xml(dataset.as_of), bold=True, align=2)] if dataset.as_of else []),  # noqa: E501
        style.paragraph(xml(generated), size=8.5, color=MUTED, align=2),
    ]
    brand = brand_block(
        style, name=dataset.shop.name, logo_key=branding.logo_key,
        activity=branding.activity, colored=bool(branding.color),
    )
    return table([[brand, right]], [244, WIDTH - 244])


def _filters(style: PdfStyle, dataset: ExportDataset) -> list:
    if not dataset.filters:
        return []
    text = dataset.text('pair').format(
        label=dataset.text('filters'), value=' · '.join(dataset.filters),
    )
    return [Spacer(1, 10), style.paragraph(xml(text), size=9, color=MUTED)]


def _total_text(style: PdfStyle, kind: str, value: int | Decimal) -> str:
    if kind == MONEY:
        return style.money(value)
    if kind == COUNT:
        return format_decimal(value, locale=style.language)
    return str(value)


def _totals(style: PdfStyle, dataset: ExportDataset) -> list:
    """Une tuile par total, sur la teinte de l'accent, puis la note d'exclusion."""
    cells = [
        [
            style.paragraph(xml(dataset.text(f'total.{t.key}').upper()), size=7.5, color=MUTED, bold=True),  # noqa: E501
            Spacer(1, 3),
            style.paragraph(xml(_total_text(style, t.kind, t.value)), size=13, bold=True),  # noqa: E501
        ]
        for t in dataset.totals
    ]
    width = WIDTH / len(cells)
    tiles = table(
        [cells], [width] * len(cells), padding=9, cornerRadii=[7.5] * 4,
        commands=[
            ('BACKGROUND', (0, 0), (-1, -1), style.tint),
            ('LINEBEFORE', (1, 0), (-1, -1), 0.6, colors.white),
        ],
    )
    note = []
    if dataset.totals_note:
        note = [Spacer(1, 4), style.paragraph(xml(dataset.totals_note), size=8, color=MUTED)]  # noqa: E501
    return [Spacer(1, 14), tiles, *note]


def _cell(
    style: PdfStyle, column: ExportColumn, row: ExportRow, dataset: ExportDataset,
) -> str | Paragraph:
    """Texte brut, rapide sur 1 000 lignes ; les colonnes `wrap` passent à la ligne."""
    value = row.values[column.key]
    if column.kind == MONEY:
        return '—' if value is None else style.money(value)
    if column.kind == QUANTITY:
        return '' if value is None else format_decimal(value, locale=dataset.lang)
    if column.kind == DATETIME:
        local: datetime = value.astimezone(dataset.tz)
        return format_date(local.date(), 'short', locale=dataset.lang)
    if column.wrap:
        return style.paragraph(xml(value or ''), size=CELL_SIZE, color=MUTED if row.excluded else INK)  # noqa: E501
    return value or ''


def _rows_table(style: PdfStyle, dataset: ExportDataset) -> Table | Paragraph:
    columns = [c for c in dataset.columns if c.compact]
    fixed = sum(c.width or 0 for c in columns)
    shared = (WIDTH - fixed) / max(sum(c.width is None for c in columns), 1)
    widths = [c.width or shared for c in columns]
    money = [i for i, c in enumerate(columns) if c.kind in NUMERIC]
    header = [
        style.paragraph(
            xml(dataset.text(f'column.{c.key}')), size=CELL_SIZE, color=colors.white,
            bold=True, align=2 if i in money else 0,
        )
        for i, c in enumerate(columns)
    ]
    rows, muted = [header], []
    for index, row in enumerate(dataset.rows, start=1):
        rows.append([_cell(style, c, row, dataset) for c in columns])
        if row.excluded:
            muted.append(('TEXTCOLOR', (0, index), (-1, index), MUTED))
    if len(rows) == 1:
        return style.paragraph(xml(dataset.empty), color=MUTED)
    return table(
        rows, widths, padding=5, repeatRows=1, cornerRadii=[7.5, 7.5, 0, 0],
        commands=[
            ('FONTNAME', (0, 0), (-1, -1), 'Invoice'),
            ('FONTSIZE', (0, 0), (-1, -1), CELL_SIZE),
            ('LEADING', (0, 0), (-1, -1), CELL_SIZE * 1.2),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TEXTCOLOR', (0, 1), (-1, -1), INK),
            ('BACKGROUND', (0, 0), (-1, 0), style.accent),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, STRIPE]),
            ('LINEBELOW', (0, 1), (-1, -1), 0.3, BORDER),
            *[('ALIGN', (i, 0), (i, -1), 'RIGHT') for i in money],
            *muted,
        ],
    )


def _footer(style: PdfStyle, dataset: ExportDataset) -> Paragraph:
    parts = [dataset.shop.name, dataset.title, *dataset.subject[:1], dataset.period]
    return style.paragraph(xml(' · '.join(parts)), size=8.25, color=MUTED, align=1)


def render_pdf(dataset: ExportDataset) -> bytes:
    register_fonts()
    branding = _branding(dataset.shop)
    style = _style(dataset, branding)
    buf = BytesIO()
    _, footer_height = _footer(style, dataset).wrap(WIDTH, A4[1])
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=30, rightMargin=30, topMargin=30,
        bottomMargin=footer_height + 40,
        title=f'{dataset.title} · {dataset.shop.name}', author=dataset.shop.name,
    )
    story = [
        _header(style, dataset, branding),
        *_filters(style, dataset),
        *_totals(style, dataset),
        Spacer(1, 16),
        _rows_table(style, dataset),
    ]
    doc.build(
        story,
        canvasmaker=lambda *args, **kwargs: NumberedCanvas(
            *args, pdf_style=style, footer=lambda: _footer(style, dataset),
            footer_height=footer_height, **kwargs,
        ),
    )
    return buf.getvalue()
