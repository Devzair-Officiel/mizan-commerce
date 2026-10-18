from collections.abc import Callable
from decimal import Decimal
from html import escape
from pathlib import Path

from babel.numbers import format_currency
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from .models import Invoice
from .pdf_labels import LABELS

WIDTH = 523.2756  # A4 moins deux marges de 48 px à 96 dpi.
INK = colors.HexColor('#1f2421')
MUTED = colors.HexColor('#6b716d')
BORDER = colors.HexColor('#e4e2dc')
STRIPE = colors.HexColor('#faf9f6')
# Accent et teinte neutres : factures sans couleur choisie, justificatif zakat.
ACCENT = colors.HexColor('#2b2f2d')
TINT = colors.HexColor('#f4f4f2')


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


class PdfStyle:
    """Langue, libellés, devise et couleurs d'un PDF : factures, justificatif zakat."""

    def __init__(
        self,
        *,
        language: str,
        labels: dict[str, str],
        currency: str,
        accent: colors.Color = ACCENT,
        tint: colors.Color = TINT,
    ) -> None:
        self.language = language
        self.labels = labels
        self.currency = currency
        self.accent = accent
        self.tint = tint

    def text(self, key: str) -> str:
        return self.labels[key]

    def money(self, value: Decimal | str) -> str:
        amount = Decimal(value)
        text = format_currency(
            abs(amount),
            self.currency,
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


class InvoiceStyle(PdfStyle):
    def __init__(self, invoice: Invoice) -> None:
        self.invoice = invoice
        self.snapshot = invoice.presentation
        language = 'en' if self.snapshot.get('language') == 'en' else 'fr'
        color = self.snapshot.get('color')
        accent = colors.HexColor(color) if color else ACCENT
        super().__init__(
            language=language,
            labels=LABELS[language],
            currency=invoice.currency,
            accent=accent,
            tint=(
                colors.linearlyInterpolatedColor(accent, colors.white, 0, 1, 0.93)
                if color
                else TINT
            ),
        )


class NumberedCanvas(Canvas):
    """Bande d'accent, pied de page et « Page x sur y » : deux passes de pagination,
    sans reconstruire le document."""

    def __init__(
        self,
        *args,
        pdf_style: PdfStyle,
        footer: Callable[[], Paragraph],
        footer_height: float,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.pdf_style = pdf_style
        self.footer = footer
        self.footer_height = footer_height
        self.pages: list[dict] = []

    def showPage(self) -> None:
        self.pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        page_count = len(self.pages)
        for state in self.pages:
            self.__dict__.update(state)
            self.draw_furniture(page_count)
            super().showPage()
        super().save()

    def draw_furniture(self, page_count: int) -> None:
        style = self.pdf_style
        self.saveState()
        self.setFillColor(style.accent)
        self.rect(0, A4[1] - 6, A4[0], 6, stroke=0, fill=1)
        self.setStrokeColor(style.accent)
        self.setLineWidth(0.6)
        self.line(36, 28 + self.footer_height, A4[0] - 36, 28 + self.footer_height)
        footer = self.footer()
        footer.wrap(WIDTH, self.footer_height)
        footer.drawOn(self, 36, 22)
        self.setFont('Invoice', 7.5)
        self.setFillColor(MUTED)
        self.drawRightString(
            A4[0] - 36,
            11,
            style.text('page').format(page=self._pageNumber, total=page_count),
        )
        self.restoreState()


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
