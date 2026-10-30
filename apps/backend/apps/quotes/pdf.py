"""Devis A4 (URS-111) : blocs et style des factures, depuis les instantanés
figés à l'envoi (vendeur, acheteur, présentation), jamais relus sur la boutique."""

from zoneinfo import ZoneInfo

from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table

from apps.invoices.pdf import notes, render
from apps.invoices.pdf_blocks import (
    format_date,
    header_block,
    lines_table,
    operation,
    parties,
    payment_and_mentions,
)
from apps.invoices.pdf_style import (
    BORDER,
    MUTED,
    WIDTH,
    InvoiceStyle,
    register_fonts,
    table,
    xml,
)
from apps.invoices.pdf_totals import document_totals

from .models import Quote

ACCEPTED = (Quote.STATUS_ACCEPTED, Quote.STATUS_INVOICED)


def _header(style: InvoiceStyle) -> Table:
    """Date d'envoi et fin de validité ; badge d'état une fois le devis répondu,
    expiré ou facturé (aucun tant qu'il attend la réponse du client)."""
    quote = style.invoice
    dates = (
        f'{style.text("issued_m")} {format_date(style.snapshot["sent_date"])} · '
        f'{style.text("valid_until")} {format_date(style.snapshot["valid_until"])}'
    )
    state = None if quote.status == Quote.STATUS_SENT else quote.status
    return header_block(style, title='quote', dates=dates, state=state)


def _acceptance(style: InvoiceStyle) -> Paragraph | None:
    """« Accepté par … le … », date dans le fuseau de la boutique."""
    quote = style.invoice
    if quote.status not in ACCEPTED or quote.accepted_at is None:
        return None
    day = quote.accepted_at.astimezone(ZoneInfo(quote.shop.timezone))
    day = day.strftime('%d/%m/%Y')
    text = (
        style.text('accepted_by').format(name=quote.accepted_name, date=day)
        if quote.accepted_name
        else style.text('accepted_on').format(date=day)
    )
    return style.paragraph(xml(text), bold=True)


def _signature_zone(style: InvoiceStyle) -> Table:
    width = (WIDTH - 12) / 2

    def field(key: str) -> list:
        return [style.paragraph(xml(style.text(key)), size=9, color=MUTED)]

    return table(
        [[field('date'), '', field('signature')]],
        [width, 12, width],
        padding=7.5,
        minRowHeights=[66],
        commands=[
            ('BOX', (0, 0), (0, 0), 0.6, BORDER),
            ('BOX', (2, 0), (2, 0), 0.6, BORDER),
        ],
    )


def agreement(style: InvoiceStyle) -> list:
    """Devis gratuit et fin de validité, puis « Bon pour accord » : date,
    signature et mention manuscrite, ou l'acceptation enregistrée."""
    validity = format_date(style.snapshot['valid_until'])
    content = [
        Spacer(1, 15),
        style.paragraph(xml(style.text('free_quote').format(date=validity))),
        Spacer(1, 12),
        style.heading('agreement'),
        Spacer(1, 6),
    ]
    accepted = _acceptance(style)
    if accepted is not None:
        content.append(accepted)
    else:
        content += [
            style.paragraph(xml(style.text('handwritten')), size=9, color=MUTED),
            Spacer(1, 7.5),
            _signature_zone(style),
        ]
    return [KeepTogether(content)]


def build_quote_pdf(quote: Quote) -> bytes:
    """PDF d'un devis envoyé (tout état sauf brouillon) ; montants HT par ligne."""
    register_fonts()
    style = InvoiceStyle(quote)
    story = [
        _header(style),
        Spacer(1, 22.5),
        parties(style, buyer_title='client'),
        *operation(style),
        Spacer(1, 13.5),
        lines_table(style),
        document_totals(style),
        *payment_and_mentions(style),
        *notes(style),
        *agreement(style),
    ]
    return render(style, story, title=style.text('quote'))
