from decimal import Decimal
from html import escape
from pathlib import Path

from babel.numbers import format_currency
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle

from .models import Invoice
from .pdf_labels import LABELS

WIDTH = 523.2756  # A4 moins deux marges de 48 px à 96 dpi.
INK = colors.HexColor('#1f2421')
MUTED = colors.HexColor('#6b716d')
BORDER = colors.HexColor('#e4e2dc')
STRIPE = colors.HexColor('#faf9f6')


def register_fonts() -> None:
    root = Path(__file__).parent / 'fonts'
    for name, file in [
        ('Invoice', 'DejaVuSans.ttf'),
        ('Invoice-Bold', 'DejaVuSans-Bold.ttf'),
    ]:
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(root / file)))
    pdfmetrics.registerFontFamily(
        'Invoice',
        normal='Invoice',
        bold='Invoice-Bold',
        italic='Invoice',
        boldItalic='Invoice-Bold',
    )


def xml(value: str) -> str:
    return escape(str(value)).replace('\n', '<br/>')


class InvoiceStyle:
    def __init__(self, invoice: Invoice) -> None:
        self.invoice = invoice
        self.snapshot = invoice.presentation
        self.language = 'en' if self.snapshot.get('language') == 'en' else 'fr'
        self.labels = LABELS[self.language]
        color = self.snapshot.get('color')
        self.accent = colors.HexColor(color or '#2b2f2d')
        self.tint = (
            colors.linearlyInterpolatedColor(self.accent, colors.white, 0, 1, 0.93)
            if color
            else colors.HexColor('#f4f4f2')
        )

    def text(self, key: str) -> str:
        return self.labels[key]

    def money(self, value: Decimal | str) -> str:
        amount = Decimal(value)
        text = format_currency(
            abs(amount),
            self.invoice.currency,
            locale=self.language,
            currency_digits=False,
        )
        return ('− ' if amount < 0 else '') + text

    def paragraph(
        self,
        text: str,
        *,
        size: float = 9.75,
        color=INK,
        bold: bool = False,
        align: int = 0,
        line_height: float = 1.2,
    ) -> Paragraph:
        return Paragraph(
            text,
            ParagraphStyle(
                'invoice',
                fontName='Invoice-Bold' if bold else 'Invoice',
                fontSize=size,
                leading=size * line_height,
                textColor=color,
                alignment=align,
                spaceAfter=0,
                splitLongWords=True,
            ),
        )

    def heading(self, key: str) -> Paragraph:
        heading = self.paragraph(
            xml(self.text(key).upper()), size=8.25, color=self.accent, bold=True
        )
        heading.keepWithNext = True
        return heading


def table(
    rows: list,
    widths: list[float],
    *,
    padding: float = 0,
    commands: list | None = None,
    **kwargs,
) -> Table:
    result = Table(rows, colWidths=widths, hAlign='LEFT', **kwargs)
    result.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), padding),
                ('RIGHTPADDING', (0, 0), (-1, -1), padding),
                ('TOPPADDING', (0, 0), (-1, -1), padding),
                ('BOTTOMPADDING', (0, 0), (-1, -1), padding),
                *(commands or []),
            ]
        )
    )
    return result
