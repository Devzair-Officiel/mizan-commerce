"""Génération du PDF d'une facture client.

Même approche que le justificatif zakat (ReportLab Platypus, pur Python). Le rendu
doit rester lisible et imprimable : en-tête vendeur/acheteur, tableau des lignes HT,
totaux HT/TVA/TTC, mentions légales libres (renseignées par le commerçant via Shop).
"""
from __future__ import annotations

from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .models import Invoice


_STATUS_LABELS = {
    Invoice.STATUS_ISSUED: 'Émise',
    Invoice.STATUS_PAID: 'Payée',
    Invoice.STATUS_CANCELLED: 'Annulée',
}


def _display_status(invoice: Invoice) -> str:
    """Statut affiché — enrichit `issued` en 'Partiellement payée' quand un acompte existe."""
    if invoice.status == Invoice.STATUS_ISSUED:
        paid = Decimal(invoice.amount_paid or 0)
        if paid > 0 and paid < Decimal(invoice.total_ttc or 0):
            return 'Partiellement payée'
        return 'Non payée'
    return _STATUS_LABELS.get(invoice.status, invoice.status)


def _fmt_money(value, currency: str) -> str:
    """Format FR — espace fine en séparateur de milliers, virgule décimale."""
    try:
        amount = Decimal(value)
    except (TypeError, ValueError):
        amount = Decimal('0')
    formatted = f'{amount:,.2f}'.replace(',', ' ').replace('.', ',')
    return f'{formatted} {currency}'


def _fmt_qty(value) -> str:
    """Quantité — entier sans décimales si la partie fractionnaire est nulle, sinon 3 décimales."""
    try:
        amount = Decimal(value)
    except (TypeError, ValueError):
        return str(value)
    if amount == amount.to_integral_value():
        return f'{amount:.0f}'
    return f'{amount:.3f}'.rstrip('0').rstrip('.')


def _nl_to_br(text: str) -> str:
    """Conversion sûre pour Paragraph (qui interprète des balises XML)."""
    if not text:
        return ''
    # On échappe d'abord les caractères HTML, puis on remet les sauts de ligne en <br/>.
    escaped = (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )
    return escaped.replace('\n', '<br/>')


def build_invoice_pdf(invoice: Invoice) -> bytes:
    """Renvoie le PDF de la facture sous forme de bytes."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f'Facture {invoice.number}',
        author=invoice.seller_name,
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=22, spaceAfter=2)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=10,
                        textColor=colors.HexColor('#6B7280'), spaceAfter=4,
                        textTransform='uppercase')
    body = ParagraphStyle('Body', parent=styles['BodyText'], fontSize=10, leading=14)
    body_right = ParagraphStyle('BodyRight', parent=body, alignment=2)
    small = ParagraphStyle('Small', parent=body, fontSize=8,
                           textColor=colors.HexColor('#6B7280'))

    story = []

    # ── En-tête : titre + numéro + statut ─────────────────────────────────
    status_label = _display_status(invoice)
    header_left = Paragraph('<b>FACTURE</b>', h1)
    header_right = Paragraph(
        f'<b>N° {invoice.number}</b><br/>'
        f'<font size="9" color="#6B7280">Statut&nbsp;: {status_label}</font>',
        body_right,
    )
    header = Table([[header_left, header_right]], colWidths=[90 * mm, 84 * mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(header)
    story.append(Spacer(1, 6 * mm))

    # ── Vendeur / Acheteur côte à côte ────────────────────────────────────
    seller_block = _build_party_block(
        title='Vendeur',
        name=invoice.seller_name,
        address=invoice.seller_address,
        tax_id=invoice.seller_tax_id,
        h2=h2, body=body, small=small,
    )
    buyer_extras: list[str] = []
    if invoice.buyer_email:
        buyer_extras.append(invoice.buyer_email)
    if invoice.buyer_phone:
        buyer_extras.append(invoice.buyer_phone)
    buyer_block = _build_party_block(
        title='Client',
        name=invoice.buyer_name or '—',
        address=invoice.buyer_address,
        tax_id='',
        extras=buyer_extras,
        h2=h2, body=body, small=small,
    )
    parties = Table(
        [[seller_block, buyer_block]],
        colWidths=[87 * mm, 87 * mm],
    )
    parties.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(parties)
    story.append(Spacer(1, 6 * mm))

    # ── Dates clé ─────────────────────────────────────────────────────────
    meta_rows = [
        ['Date d\'émission', invoice.issued_at.strftime('%d/%m/%Y')],
        ['Échéance', invoice.due_date.strftime('%d/%m/%Y')],
    ]
    if invoice.status == Invoice.STATUS_PAID and invoice.paid_at:
        meta_rows.append(['Payée le', invoice.paid_at.strftime('%d/%m/%Y')])
    elif invoice.status == Invoice.STATUS_CANCELLED and invoice.cancelled_at:
        meta_rows.append(['Annulée le', invoice.cancelled_at.strftime('%d/%m/%Y')])
    story.append(_meta_table(meta_rows))
    story.append(Spacer(1, 6 * mm))

    # ── Tableau des lignes ────────────────────────────────────────────────
    story.append(Paragraph('Détail', h2))
    line_rows: list[list] = [
        ['Description', 'Qté', 'PU HT', 'Total HT'],
    ]
    for line in invoice.lines.all():
        line_rows.append([
            Paragraph(_nl_to_br(line.description), body),
            _fmt_qty(line.quantity),
            _fmt_money(line.unit_price_ht, invoice.currency),
            _fmt_money(line.line_subtotal_ht, invoice.currency),
        ])
    lines_table = Table(line_rows, colWidths=[90 * mm, 18 * mm, 32 * mm, 34 * mm])
    lines_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#374151')),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(lines_table)
    story.append(Spacer(1, 4 * mm))

    # ── Totaux ────────────────────────────────────────────────────────────
    tax_rate = Decimal(invoice.tax_rate or 0)
    discount_amount = Decimal(invoice.discount_amount or 0)
    shipping_amount = Decimal(invoice.shipping_amount or 0)
    totals_rows: list[list[str]] = [
        ['Sous-total HT', _fmt_money(invoice.subtotal_ht, invoice.currency)],
    ]
    if discount_amount > 0:
        totals_rows.append(['Remise', f'− {_fmt_money(discount_amount, invoice.currency)}'])
    if shipping_amount > 0:
        totals_rows.append(['Frais de port', _fmt_money(shipping_amount, invoice.currency)])
    if tax_rate > 0:
        rate_label = f'{tax_rate:.2f}'.rstrip('0').rstrip('.')
        totals_rows.append([f'TVA {rate_label}%', _fmt_money(invoice.tax_amount, invoice.currency)])
    else:
        totals_rows.append(['TVA', 'Non applicable'])
    totals_rows.append(['Total TTC', _fmt_money(invoice.total_ttc, invoice.currency)])
    total_ttc_row = len(totals_rows) - 1

    # Paiement partiel : afficher 'Payé' et 'Reste à payer' sous le Total TTC.
    amount_paid = Decimal(invoice.amount_paid or 0)
    total_ttc = Decimal(invoice.total_ttc or 0)
    remaining = total_ttc - amount_paid
    show_payment_breakdown = (
        invoice.status == Invoice.STATUS_ISSUED
        and amount_paid > 0
        and remaining > 0
    )
    if show_payment_breakdown:
        totals_rows.append(['Payé', _fmt_money(amount_paid, invoice.currency)])
        totals_rows.append(['Reste à payer', _fmt_money(remaining, invoice.currency)])

    totals_table = Table(totals_rows, colWidths=[124 * mm, 50 * mm])
    style_cmds = [
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, total_ttc_row - 1), 0.4, colors.HexColor('#E5E7EB')),
        ('LINEABOVE', (0, total_ttc_row), (-1, total_ttc_row), 1, colors.HexColor('#111827')),
        ('FONTNAME', (0, total_ttc_row), (-1, total_ttc_row), 'Helvetica-Bold'),
        ('FONTSIZE', (0, total_ttc_row), (-1, total_ttc_row), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]
    if show_payment_breakdown:
        # 'Reste à payer' en gras pour mettre en évidence le solde dû.
        style_cmds.append(('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'))
        style_cmds.append(('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#B45309')))
    totals_table.setStyle(TableStyle(style_cmds))
    story.append(totals_table)
    story.append(Spacer(1, 6 * mm))

    # ── Notes (optionnel) ─────────────────────────────────────────────────
    if invoice.notes:
        story.append(Paragraph('Notes', h2))
        story.append(Paragraph(_nl_to_br(invoice.notes), body))
        story.append(Spacer(1, 4 * mm))

    # ── Mentions légales (libres, renseignées par le commerçant) ──────────
    if invoice.seller_legal_mentions:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph('Mentions légales', h2))
        story.append(Paragraph(_nl_to_br(invoice.seller_legal_mentions), small))

    doc.build(story)
    return buf.getvalue()


def _build_party_block(
    *,
    title: str,
    name: str,
    address: str,
    tax_id: str,
    extras: list[str] | None = None,
    h2: ParagraphStyle,
    body: ParagraphStyle,
    small: ParagraphStyle,
) -> Table:
    """Bloc vendeur/acheteur — titre en haut, nom en gras, puis adresse multiligne."""
    inner: list[list] = [[Paragraph(title, h2)]]
    inner.append([Paragraph(f'<b>{_nl_to_br(name)}</b>', body)])
    if address:
        inner.append([Paragraph(_nl_to_br(address), body)])
    for extra in extras or []:
        inner.append([Paragraph(_nl_to_br(extra), body)])
    if tax_id:
        inner.append([Paragraph(f'<font color="#6B7280">ID fiscal&nbsp;: {_nl_to_br(tax_id)}</font>', small)])
    table = Table(inner, colWidths=[87 * mm])
    table.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    return table


def _meta_table(rows: list[list[str]]) -> Table:
    """Petit tableau clé/valeur aligné gauche/droite."""
    table = Table(rows, colWidths=[60 * mm, 114 * mm])
    table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6B7280')),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return table
