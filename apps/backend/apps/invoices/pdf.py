"""Factures et avoirs A4 ReportLab, depuis les seuls instantanés (URS-094 à
URS-099, URS-112)."""

from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.platypus import KeepTogether, SimpleDocTemplate, Spacer

from .models import Invoice
from .formatting import format_siret
from .pdf_blocks import (
    format_date,
    header,
    legal_mentions,
    lines_table,
    operation,
    parties,
    payment_and_mentions,
    summary,
)
from .pdf_style import (
    MUTED,
    WIDTH,
    InvoiceStyle,
    NumberedCanvas,
    register_fonts,
    xml,
)
from .pdf_totals import document_totals, invoice_totals


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


def render(style: InvoiceStyle, story: list, *, title: str) -> bytes:
    """A4 déterministe, pied de page et pagination : factures, avoirs, devis.

    Polices déjà enregistrées (`register_fonts`) par l'appelant.
    """
    buf = BytesIO()
    _, footer_height = footer_paragraph(style).wrap(WIDTH, A4[1])
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=30,
        rightMargin=30,
        topMargin=30,
        bottomMargin=footer_height + 40,
        title=f'{title} {style.invoice.number}',
        author=style.invoice.seller_name,
        invariant=1,
    )
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


def _order_reference(style: InvoiceStyle) -> list:
    number = style.snapshot.get('order_number')
    if not number:
        return []
    order_date = style.snapshot.get('order_date', '')
    order_date = format_date(order_date) if order_date else ''
    reference = f'{style.text("order")} {number} {style.text("on")} {order_date}'
    return [Spacer(1, 10.5), style.paragraph(xml(reference), size=9, color=MUTED)]


def _credit_reference(style: InvoiceStyle) -> list:
    """Avoir : numéro et date de la facture d'origine (instantané), motif."""
    issued = style.snapshot.get('credited_issued_date')
    reference = (
        f'{xml(style.text("credit_of"))} '
        f'<b>{xml(style.snapshot.get("credited_number", ""))}</b>'
    )
    if issued:
        reference += f' {xml(style.text("on"))} {format_date(issued)}'
    rows = [Spacer(1, 10.5), style.paragraph(reference)]
    reason = style.invoice.credit_reason
    if reason:
        rows.append(style.paragraph(xml(style.text('reason').format(reason=reason))))
    return rows


def notes(style: InvoiceStyle) -> list:
    if not style.invoice.notes:
        return []
    return [
        Spacer(1, 12),
        style.heading('notes'),
        style.paragraph(xml(style.invoice.notes), size=9),
    ]


def build_invoice_pdf(invoice: Invoice) -> bytes:
    """PDF déterministe : réglages, langue, logo, commande et compte déjà figés.

    Avoir : facture d'origine et motif, montants négatifs, ni règlement ni
    relevé de compte.
    """
    register_fonts()
    style = InvoiceStyle(invoice)
    credit = invoice.kind == Invoice.KIND_CREDIT_NOTE
    story = [header(style), Spacer(1, 22.5), parties(style), *operation(style)]
    story += _order_reference(style)
    if credit:
        story += [
            *_credit_reference(style),
            Spacer(1, 13.5),
            lines_table(style),
            document_totals(style),
            KeepTogether([Spacer(1, 15), *legal_mentions(style)]),
        ]
    else:
        story += [
            Spacer(1, 13.5),
            lines_table(style),
            invoice_totals(style),
            *summary(style),
            *payment_and_mentions(style),
        ]
    title = style.text('credit_note' if credit else 'invoice')
    return render(style, [*story, *notes(style)], title=title)
