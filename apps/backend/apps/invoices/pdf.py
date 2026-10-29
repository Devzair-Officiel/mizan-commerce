"""Factures A4 ReportLab, depuis les seuls instantanés (URS-094 à URS-099)."""

from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Spacer

from .models import Invoice
from .formatting import format_siret
from .pdf_blocks import (
    header,
    lines_table,
    operation,
    parties,
    payment_and_mentions,
    summary,
    totals,
)
from .pdf_style import (
    MUTED,
    WIDTH,
    InvoiceStyle,
    NumberedCanvas,
    register_fonts,
    xml,
)


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
    story = [header(style), Spacer(1, 22.5), parties(style), *operation(style)]
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
            pdf_style=style,
            footer=lambda: footer_paragraph(style),
            footer_height=footer_height,
            **kwargs,
        ),
    )
    return buf.getvalue()
