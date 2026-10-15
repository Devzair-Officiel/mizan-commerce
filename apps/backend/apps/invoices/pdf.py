"""Factures A4 ReportLab, depuis les seuls instantanés (URS-094 à URS-099)."""

from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate, Spacer

from .models import Invoice
from .formatting import format_siret
from .pdf_blocks import (
    header,
    lines_table,
    parties,
    payment_and_mentions,
    summary,
    totals,
)
from .pdf_style import MUTED, WIDTH, InvoiceStyle, register_fonts, xml


class NumberedCanvas(Canvas):
    """Deux passes de pagination, sans reconstruire le document."""

    def __init__(
        self, *args, invoice_style: InvoiceStyle, footer_height: float, **kwargs
    ) -> None:
        super().__init__(*args, **kwargs)
        self.invoice_style = invoice_style
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
        style = self.invoice_style
        self.saveState()
        self.setFillColor(style.accent)
        self.rect(0, A4[1] - 6, A4[0], 6, stroke=0, fill=1)
        self.setStrokeColor(style.accent)
        self.setLineWidth(0.6)
        self.line(36, 28 + self.footer_height, A4[0] - 36, 28 + self.footer_height)
        footer = footer_paragraph(style)
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


def footer_paragraph(style: InvoiceStyle):
    invoice = style.invoice
    parts = [invoice.seller_name, invoice.seller_address.replace('\n', ', ')]
    siret = style.snapshot.get('siret')
    if siret:
        parts.append('SIRET ' + format_siret(siret))
    parts.append(style.text('thanks'))
    return style.paragraph(
        xml(' · '.join(p for p in parts if p)), size=8.25, color=MUTED, align=1
    )


def build_invoice_pdf(invoice: Invoice) -> bytes:
    """PDF déterministe : réglages, langue, logo, commande et compte déjà figés."""
    register_fonts()
    style = InvoiceStyle(invoice)
    buf = BytesIO()
    _, footer_height = footer_paragraph(style).wrap(WIDTH, A4[1])
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=30,
        rightMargin=30,
        topMargin=30,
        bottomMargin=footer_height + 40,
        title=f'{style.text("invoice")} {invoice.number}',
        author=invoice.seller_name,
        invariant=1,
    )
    story = [header(style), Spacer(1, 22.5), parties(style)]
    if style.snapshot.get('order_number'):
        order_date = style.snapshot.get('order_date', '')
        from datetime import date

        order_date = (
            date.fromisoformat(order_date).strftime('%d/%m/%Y') if order_date else ''
        )
        reference = (
            f'{style.text("order")} {style.snapshot["order_number"]} '
            f'{style.text("on")} {order_date}'
        )
        story += [Spacer(1, 10.5), style.paragraph(xml(reference), size=9, color=MUTED)]
    story += [
        Spacer(1, 13.5),
        lines_table(style),
        totals(style),
        *summary(style),
        *payment_and_mentions(style),
    ]
    if invoice.notes:
        story += [
            Spacer(1, 12),
            style.heading('notes'),
            style.paragraph(xml(invoice.notes), size=9),
        ]
    doc.build(
        story,
        canvasmaker=lambda *args, **kwargs: NumberedCanvas(
            *args,
            invoice_style=style,
            footer_height=footer_height,
            **kwargs,
        ),
    )
    return buf.getvalue()
