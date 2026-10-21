from datetime import date
from decimal import Decimal
from io import BytesIO

from PIL import Image as PillowImage, ImageOps
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Image, KeepTogether, Spacer, Table

from apps.core.storage import download_bytes, is_storage_configured
from apps.products.constants import is_default_variant
from .pdf_style import (
    BORDER,
    MUTED,
    STRIPE,
    WIDTH,
    InvoiceStyle,
    PdfStyle,
    table,
    xml,
)
from .services import display_line_description
from .formatting import (
    format_iban,
    format_invoice_phone,
    format_siret,
    format_tax_id,
    format_vat_number,
)


def status_key(style: InvoiceStyle) -> str:
    invoice = style.invoice
    if invoice.status == 'issued':
        return 'partial' if 0 < invoice.amount_paid < invoice.total_ttc else 'unpaid'
    return invoice.status


def brand(style: InvoiceStyle) -> Table:
    return brand_block(
        style,
        name=style.invoice.seller_name,
        logo_key=style.snapshot.get('logo_object_key') or '',
        activity=style.snapshot.get('activity') or '',
        colored=bool(style.snapshot.get('color')),
    )


def brand_block(
    style: PdfStyle, *, name: str, logo_key: str, activity: str, colored: bool
) -> Table:
    """Logo (sinon l'initiale sur l'accent), nom et activité : factures, exports.

    Sans couleur choisie, le logo passe en niveaux de gris.
    """
    mark = style.paragraph(
        xml(name[:1].upper()),
        size=22,
        color=colors.white,
        bold=True,
        align=1,
    )
    if logo_key and is_storage_configured():
        # Référence privée (instantané ou boutique), jamais une URL du client.
        content = download_bytes(logo_key)
        if not colored:
            with PillowImage.open(BytesIO(content)) as source:
                gray = ImageOps.grayscale(source).convert('RGBA')
                gray.putalpha(source.convert('RGBA').getchannel('A'))
                output = BytesIO()
                gray.save(output, format='PNG')
                content = output.getvalue()
        mark = Image(
            BytesIO(content),
            width=39,
            height=39,
            kind='proportional',
            lazy=0,
        )
    lines = [style.paragraph(xml(name), size=13.5, bold=True)]
    if activity:
        lines.append(style.paragraph(xml(activity), size=9, color=MUTED))
    mark_box = table(
        [[mark]],
        [39],
        commands=(
            [('BACKGROUND', (0, 0), (-1, -1), style.accent)] if not logo_key else []
        ),
        minRowHeights=[39],
        cornerRadii=[10.5] * 4,
    )
    return table([[mark_box, '', lines]], [39, 9, 196])


def header(style: InvoiceStyle) -> Table:
    invoice = style.invoice
    issued = style.snapshot.get('issued_date', invoice.issued_at.date().isoformat())
    issued = date.fromisoformat(issued).strftime('%d/%m/%Y')
    dates = (
        f'{style.text("issued")} {issued} · '
        f'{style.text("due")} {invoice.due_date:%d/%m/%Y}'
    )
    state = status_key(style)
    label = style.text(state).upper()
    if not style.snapshot.get('color'):
        badge_bg, badge_fg = colors.HexColor('#ededeb'), colors.HexColor('#404440')
    else:
        badge_bg, badge_fg = {
            'paid': ('#e3f1e3', '#2f7a3e'),
            'partial': ('#fdf1dc', '#8a5a00'),
            'unpaid': ('#f4f4f2', '#6b716d'),
            'cancelled': ('#fbe7e4', '#b91c1c'),
        }[state]
        badge_bg, badge_fg = colors.HexColor(badge_bg), colors.HexColor(badge_fg)
    badge = table(
        [[style.paragraph(label, size=8.25, color=badge_fg, bold=True, align=1)]],
        [stringWidth(label, 'Invoice-Bold', 8.25) + 15],
        padding=3,
        cornerRadii=[9, 9, 9, 9],
        commands=[('BACKGROUND', (0, 0), (-1, -1), badge_bg)],
    )
    badge_width = stringWidth(label, 'Invoice-Bold', 8.25) + 15
    badge = table([['', badge]], [WIDTH - 244 - badge_width, badge_width])
    right = [
        style.paragraph(
            style.text('invoice'), size=22.5, color=style.accent, bold=True, align=2
        ),
        Spacer(1, 9),
        style.paragraph(
            f'{style.text("number")} <b>{xml(invoice.number)}</b>', size=9.75, align=2
        ),
        style.paragraph(xml(dates), size=8.5, color=MUTED, align=2),
        Spacer(1, 6),
        badge,
    ]
    return table([[brand(style), right]], [244, WIDTH - 244])


def _party_content(
    style: InvoiceStyle, title: str, name: str, values: list[str]
) -> list:
    return [
        style.heading(title),
        Spacer(1, 6),
        style.paragraph(xml(name or '—'), bold=True, line_height=1.4),
        *[style.paragraph(xml(value), line_height=1.4) for value in values if value],
    ]


def parties(style: InvoiceStyle) -> Table:
    invoice = style.invoice
    seller_values = [invoice.seller_address]
    if style.snapshot.get('siret'):
        seller_values.append('SIRET ' + format_siret(style.snapshot['siret']))
    if invoice.seller_tax_id and invoice.seller_tax_id != style.snapshot.get('siret'):
        seller_values.append(
            style.text('tax_id') + ' : ' + format_tax_id(invoice.seller_tax_id)
        )
    if style.snapshot.get('vat_number'):
        seller_values.append(
            style.text('vat') + ' : ' + format_vat_number(style.snapshot['vat_number'])
        )
    contacts = [
        format_invoice_phone(contact['value'], invoice.seller_country)
        if contact['type'] == 'phone'
        else contact['value']
        for contact in style.snapshot.get('contacts', [])
    ]
    seller_values.extend(contacts)
    seller = _party_content(style, 'seller', invoice.seller_name, seller_values)
    buyer = _party_content(
        style,
        'buyer',
        invoice.buyer_name,
        [
            invoice.buyer_address,
            invoice.buyer_email,
            format_invoice_phone(invoice.buyer_phone, invoice.buyer_country),
        ],
    )
    width = (WIDTH - 12) / 2

    def block(content):
        return table(
            [[content]],
            [width],
            padding=12,
            cornerRadii=[9] * 4,
            commands=[('BACKGROUND', (0, 0), (-1, -1), style.tint)],
            splitInRow=1,
        )

    return table([[block(seller), '', block(buyer)]], [width, 12, width], splitInRow=1)


def lines_table(style: InvoiceStyle) -> Table:
    headings = ('description', 'quantity', 'unit', 'amount')
    rows = [
        [
            style.paragraph(
                xml(style.text(key).upper()),
                size=8.25,
                bold=True,
                color=colors.white,
                align=0 if i == 0 else (1 if i == 1 else 2),
            )
            for i, key in enumerate(headings)
        ]
    ]
    for line in style.invoice.lines.all():
        name = line.product_name or display_line_description(line.description)
        description = '<b>' + xml(name) + '</b>'
        variant = line.variant_name
        if variant and not is_default_variant(variant):
            description += f'<br/><font size="9" color="#6b716d">{xml(variant)}</font>'
        rows.append(
            [
                style.paragraph(description),
                style.paragraph(f'{Decimal(line.quantity).normalize():f}', align=1),
                style.paragraph(xml(style.money(line.unit_price_ht)), align=2),
                style.paragraph(
                    xml(style.money(line.line_subtotal_ht)), bold=True, align=2
                ),
            ]
        )
    return table(
        rows,
        [WIDTH - 222, 42, 94, 86],
        padding=8.25,
        repeatRows=1,
        cornerRadii=[7.5, 7.5, 0, 0],
        splitInRow=0,
        commands=[
            ('BACKGROUND', (0, 0), (-1, 0), style.accent),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, STRIPE]),
            ('LINEBELOW', (0, 1), (-1, -1), 0.3, BORDER),
        ],
    )


def _totals_rows(style: InvoiceStyle) -> tuple[list, int]:
    invoice = style.invoice
    amounts = [(style.text('subtotal'), invoice.subtotal_ht)]
    if invoice.discount_amount:
        amounts.append((style.text('discount'), -invoice.discount_amount))
    if invoice.shipping_amount:
        amounts.append((style.text('shipping'), invoice.shipping_amount))
    amounts.append((style.text('total'), invoice.total_ttc))
    cells = [
        [
            style.paragraph(xml(label), bold=i == len(amounts) - 1, line_height=1.35),
            style.paragraph(
                xml(style.money(value)),
                bold=i == len(amounts) - 1,
                align=2,
                line_height=1.35,
            ),
        ]
        for i, (label, value) in enumerate(amounts)
    ]
    applicable = (
        bool(invoice.tax_rate) or style.snapshot.get('vat_regime') == 'applicable'
    )
    tax = style.money(invoice.tax_amount) if applicable else style.text('no_vat')
    label = style.text('vat') + (
        f' {invoice.tax_rate.normalize():f} %' if applicable else ''
    )
    green = colors.HexColor('#2f7a4a') if style.snapshot.get('color') else MUTED
    cells += [
        [
            style.paragraph(xml(label), color=MUTED, line_height=1.35),
            style.paragraph(xml(tax), align=2, line_height=1.35),
        ],
        [
            style.paragraph(style.text('received'), color=green, line_height=1.35),
            style.paragraph(
                xml(style.money(-invoice.amount_paid)),
                color=green,
                align=2,
                line_height=1.35,
            ),
        ],
    ]
    return cells, len(amounts) - 1


def _amount_due(style: InvoiceStyle) -> Table:
    invoice = style.invoice
    remaining = (
        max(Decimal('0'), invoice.total_ttc - invoice.amount_paid)
        if invoice.status == 'issued'
        else Decimal('0')
    )
    label = style.paragraph(
        xml(style.text('remaining').upper()), size=9, bold=True, color=colors.white
    )
    amount = style.paragraph(
        xml(style.money(remaining)), size=15, bold=True, color=colors.white, align=2
    )
    return table(
        [[label, amount]],
        [119, 106],
        padding=10.5,
        cornerRadii=[7.5] * 4,
        commands=[('BACKGROUND', (0, 0), (-1, -1), style.accent)],
    )


def totals(style: InvoiceStyle) -> KeepTogether:
    cells, total_row = _totals_rows(style)
    amounts = table(
        cells,
        [125, 100],
        padding=4.5,
        commands=[('LINEABOVE', (0, total_row), (-1, total_row), 0.6, BORDER)],
    )
    block = table([[[amounts, Spacer(1, 7.5), _amount_due(style)]]], [225])
    block.hAlign = 'RIGHT'
    return KeepTogether([Spacer(1, 10.5), block])


def summary(style: InvoiceStyle) -> list:
    summary = style.snapshot.get('account_summary')
    if not style.snapshot.get('show_account_summary') or not summary:
        return []
    numbers = ', '.join(i['number'] for i in summary['previous_invoices'])
    previous = style.text('previous') + (f' ({numbers})' if numbers else '')
    values = [
        (previous, summary['previous_balance']),
        (style.text('payments'), -Decimal(summary['payments_received'])),
        (style.text('current'), summary['current_invoice']),
        (style.text('balance'), summary['total_balance']),
    ]
    rows = [
        [
            style.paragraph(
                xml(label), bold=i == 3, color=MUTED if i < 3 else style.accent
            ),
            style.paragraph(xml(style.money(value)), bold=i == 3, align=2),
        ]
        for i, (label, value) in enumerate(values)
    ]
    return [
        KeepTogether(
            [
                Spacer(1, 15),
                style.heading('summary'),
                Spacer(1, 7.5),
                table(
                    rows,
                    [WIDTH - 115, 115],
                    padding=5.25,
                    commands=[('LINEABOVE', (0, -1), (-1, -1), 0.6, BORDER)],
                    splitInRow=0,
                    splitByRow=0,
                ),
            ]
        )
    ]


def payment_and_mentions(style: InvoiceStyle) -> list:
    invoice = style.invoice
    days = style.snapshot.get('payment_terms_days')
    conditions = (
        style.text('receipt')
        if days == 0
        else (style.text('days').format(days=days) if days else '')
    )
    methods = [style.text(key) for key in style.snapshot.get('payment_methods', [])]
    payment = [style.heading('payment'), Spacer(1, 6), style.paragraph(xml(conditions))]
    if methods:
        payment.append(
            style.paragraph(xml(style.text('methods') + ', '.join(methods) + '.'))
        )
    if style.snapshot.get('iban') and 'transfer' in style.snapshot.get(
        'payment_methods', []
    ):
        payment.append(
            style.paragraph(
                xml('IBAN ' + format_iban(style.snapshot['iban'])), size=9, color=MUTED
            )
        )
        if style.snapshot.get('bic'):
            payment.append(
                style.paragraph(
                    xml('BIC ' + style.snapshot['bic']), size=9, color=MUTED
                )
            )
    legal = invoice.seller_legal_mentions
    if style.snapshot.get('vat_regime') == 'exempt':
        legal = style.text('exempt') + '\n' + legal
    mentions = [
        style.heading('mentions'),
        Spacer(1, 6),
        style.paragraph(xml(legal), size=9, color=MUTED),
    ]
    width = (WIDTH - 12) / 2
    return [
        KeepTogether(
            [
                Spacer(1, 15),
                table(
                    [[payment, '', mentions]],
                    [width, 12, width],
                    splitInRow=0,
                    splitByRow=0,
                ),
            ]
        )
    ]
