"""Totaux des PDF : facture, avoir et devis (URS-094, URS-111, URS-112).

Facture : déjà réglé, avoirs émis et reste à payer net des avoirs. Avoir et
devis : montants signés (`style.sign`), total TTC dans le bandeau d'accent.
"""

from decimal import Decimal

from reportlab.lib import colors
from reportlab.platypus import KeepTogether, Spacer, Table

from .models import Invoice
from .pdf_style import BORDER, INK, MUTED, InvoiceStyle, table, xml


def _row(
    style: InvoiceStyle,
    label: str,
    amount: str,
    *,
    bold: bool = False,
    color: colors.Color = INK,
    label_color: colors.Color | None = None,
) -> list:
    return [
        style.paragraph(
            xml(label), bold=bold, color=label_color or color, line_height=1.35
        ),
        style.paragraph(xml(amount), bold=bold, color=color, align=2, line_height=1.35),
    ]


def _green(style: InvoiceStyle) -> colors.Color:
    """Règlements et avoirs : vert en couleur, gris sur un document neutre."""
    return colors.HexColor('#2f7a4a') if style.snapshot.get('color') else MUTED


def _amount_rows(style: InvoiceStyle, *, with_total: bool) -> list:
    document, sign = style.invoice, style.sign
    amounts = [(style.text('subtotal'), sign * document.subtotal_ht)]
    if document.discount_amount:
        amounts.append((style.text('discount'), -sign * document.discount_amount))
    if document.shipping_amount:
        amounts.append((style.text('shipping'), sign * document.shipping_amount))
    if with_total:
        amounts.append((style.text('total'), sign * document.total_ttc))
    total = len(amounts) - 1 if with_total else -1
    return [
        _row(style, label, style.money(value), bold=i == total)
        for i, (label, value) in enumerate(amounts)
    ]


def _vat_row(style: InvoiceStyle) -> list:
    document = style.invoice
    applicable = (
        bool(document.tax_rate) or style.snapshot.get('vat_regime') == 'applicable'
    )
    tax = (
        style.money(style.sign * document.tax_amount)
        if applicable
        else style.text('no_vat')
    )
    label = style.text('vat') + (
        f' {document.tax_rate.normalize():f} %' if applicable else ''
    )
    return _row(style, label, tax, label_color=MUTED)


def _credit_note_rows(style: InvoiceStyle) -> list:
    """« Avoirs émis » : numéro et montant de chaque avoir de la boutique."""
    invoice = style.invoice
    if not invoice.credited_total:
        return []
    notes = sorted(
        (n for n in invoice.credit_notes.all() if n.shop_id == invoice.shop_id),
        key=lambda note: (note.issued_at, note.number),
    )
    green = _green(style)
    return [
        _row(style, style.text('credit_notes'), '', color=green),
        *[
            _row(style, note.number, style.money(-note.total_ttc), color=green)
            for note in notes
        ],
    ]


def _accent_box(style: InvoiceStyle, label_key: str, value: Decimal) -> Table:
    label = style.paragraph(
        xml(style.text(label_key).upper()), size=9, bold=True, color=colors.white
    )
    amount = style.paragraph(
        xml(style.money(value)), size=15, bold=True, color=colors.white, align=2
    )
    return table(
        [[label, amount]],
        [119, 106],
        padding=10.5,
        cornerRadii=[7.5] * 4,
        commands=[('BACKGROUND', (0, 0), (-1, -1), style.accent)],
    )


def _block(rows: list, box: Table, commands: list | None = None) -> KeepTogether:
    amounts = table(rows, [125, 100], padding=4.5, commands=commands)
    block = table([[[amounts, Spacer(1, 7.5), box]]], [225])
    block.hAlign = 'RIGHT'
    return KeepTogether([Spacer(1, 10.5), block])


def remaining(invoice: Invoice) -> Decimal:
    """Net des avoirs ; jamais négatif (règlement supérieur au net dû)."""
    if invoice.status != Invoice.STATUS_ISSUED:
        return Decimal('0')
    return max(
        Decimal('0'), invoice.total_ttc - invoice.credited_total - invoice.amount_paid
    )


def invoice_totals(style: InvoiceStyle) -> KeepTogether:
    invoice = style.invoice
    rows = _amount_rows(style, with_total=True)
    total_row = len(rows) - 1
    rows += [
        _vat_row(style),
        _row(
            style,
            style.text('received'),
            style.money(-invoice.amount_paid),
            color=_green(style),
        ),
        *_credit_note_rows(style),
    ]
    return _block(
        rows,
        _accent_box(style, 'remaining', remaining(invoice)),
        [('LINEABOVE', (0, total_row), (-1, total_row), 0.6, BORDER)],
    )


def document_totals(style: InvoiceStyle) -> KeepTogether:
    """Avoir (montants négatifs) ou devis : sous-total, TVA, total TTC."""
    rows = [*_amount_rows(style, with_total=False), _vat_row(style)]
    total = style.sign * style.invoice.total_ttc
    return _block(rows, _accent_box(style, 'total', total))
