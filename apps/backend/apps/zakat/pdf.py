"""Génération du justificatif PDF d'un calcul de zakat finalisé.

On utilise ReportLab Platypus pour rester en pur Python (pas de WeasyPrint qui exige
des libs système). Le rendu reste simple : en-tête boutique, méta, tableau patrimoine,
tableau dettes, formule détaillée, montant final, mention indicative.
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

from .models import ZakatCalculation


# Catalogues — on duplique volontairement ceux des serializers pour ne pas créer
# de dépendance cyclique (serializers utilise déjà ce module).
_DEBT_LABELS = {
    'supplier': 'Fournisseurs',
    'tax_vat': 'TVA / impôts',
    'salary': 'Salaires',
    'loan': 'Emprunt bancaire',
    'rent': 'Loyer',
    'other': 'Autre',
}

_EXCLUDED_LABELS = {
    'vehicle': 'Véhicules (camionnette, voiture pro)',
    'computer': 'Ordinateurs, tablettes',
    'machine': 'Machines, équipements',
    'premises': 'Local commercial',
    'furniture': 'Mobilier (étagères, comptoir)',
    'other': 'Autre outil de travail',
}

# Ordre déterministe — utilisé pour afficher tous les items possibles avec coché/non coché.
_EXCLUDED_ORDER = ['vehicle', 'computer', 'machine', 'premises', 'furniture', 'other']

_STOCK_LABELS = {
    'finished': 'Marchandises finies',
    'raw_materials': 'Matières premières',
    'work_in_progress': 'Produits en cours de fabrication',
    'in_transit': 'Marchandises en transit',
}

_RECEIVABLE_LABELS = {
    'certain': 'Créances certaines',
    'probable': 'Créances probables',
    'doubtful': 'Créances douteuses (archivées, hors base)',
}


def _fmt(value, currency: str) -> str:
    """Format FR — espace fine comme séparateur de milliers, virgule décimale."""
    try:
        amount = Decimal(value)
    except (TypeError, ValueError):
        amount = Decimal('0')
    formatted = f'{amount:,.2f}'.replace(',', ' ').replace('.', ',')
    return f'{formatted} {currency}'


def build_zakat_pdf(calc: ZakatCalculation) -> bytes:
    """Renvoie le PDF du calcul sous forme de bytes. Le calcul doit être finalisé."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f'Zakat {calc.reference_date}',
        author=calc.shop.name,
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=18, spaceAfter=4)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=11,
                        textColor=colors.HexColor('#6B7280'), spaceAfter=6,
                        textTransform='uppercase')
    body = ParagraphStyle('Body', parent=styles['BodyText'], fontSize=10, leading=14)
    small = ParagraphStyle('Small', parent=body, fontSize=8,
                           textColor=colors.HexColor('#6B7280'))

    story = []

    # En-tête : boutique + dates
    story.append(Paragraph(f'<b>Justificatif de zakat commerciale</b>', h1))
    story.append(Paragraph(
        f'{calc.shop.name} — date de référence&nbsp;: '
        f'<b>{calc.reference_date.strftime("%d/%m/%Y")}</b>',
        body,
    ))
    if calc.finalized_at:
        story.append(Paragraph(
            f'Finalisé le {calc.finalized_at.strftime("%d/%m/%Y à %Hh%M")}',
            small,
        ))
    story.append(Spacer(1, 8 * mm))

    # Patrimoine zakatable — on déplie les ventilations si présentes pour traçabilité.
    story.append(Paragraph('Patrimoine zakatable', h2))
    patrimoine_rows = [
        ['Argent disponible', _fmt(calc.cash_amount, calc.currency)],
    ]

    if calc.receivables_breakdown:
        for r in calc.receivables_breakdown:
            label = _RECEIVABLE_LABELS.get(r.get('category'), 'Créances')
            patrimoine_rows.append([f'  ↳ {label}', _fmt(r.get('amount', '0'), calc.currency)])
    else:
        patrimoine_rows.append(
            ['Créances récupérables', _fmt(calc.receivables_amount, calc.currency)],
        )

    if calc.stock_breakdown:
        for s in calc.stock_breakdown:
            label = _STOCK_LABELS.get(s.get('category'), 'Stock')
            patrimoine_rows.append([f'  ↳ {label}', _fmt(s.get('amount', '0'), calc.currency)])
    else:
        stock_label = 'Stock commercial (ajusté)' if calc.stock_value_adjusted else 'Stock commercial (estimé)'
        patrimoine_rows.append([stock_label, _fmt(calc.stock_value_for_base, calc.currency)])

    patrimoine_total = (
        Decimal(calc.cash_amount or 0)
        + Decimal(calc.receivables_amount or 0)
        + Decimal(calc.stock_value_for_base or 0)
    )
    patrimoine_rows.append(['Sous-total positif', _fmt(patrimoine_total, calc.currency)])
    story.append(_money_table(patrimoine_rows))
    story.append(Spacer(1, 6 * mm))

    # Dettes — uniquement si déclarées
    if calc.debts_breakdown:
        story.append(Paragraph('Dettes déclarées', h2))
        debt_rows = []
        for debt in calc.debts_breakdown:
            label = debt.get('label') or _DEBT_LABELS.get(debt.get('category'), 'Dette')
            cat = _DEBT_LABELS.get(debt.get('category'), '—')
            due = 'exigible' if debt.get('is_immediately_due') else 'non exigible'
            debt_rows.append([
                f'{label} ({cat}, {due})',
                _fmt(debt.get('amount', '0'), calc.currency),
            ])
        debt_rows.append(['Total déductible', _fmt(calc.short_term_debts, calc.currency)])
        story.append(_money_table(debt_rows))
        story.append(Spacer(1, 6 * mm))

    # Formule détaillée
    story.append(Paragraph('Calcul', h2))
    rate_pct = (Decimal(calc.zakat_rate) * 100).quantize(Decimal('0.01'))
    story.append(Paragraph(
        f'Base = patrimoine − dettes exigibles = '
        f'<b>{_fmt(patrimoine_total, calc.currency)}</b> − '
        f'<b>{_fmt(calc.short_term_debts, calc.currency)}</b> = '
        f'<b>{_fmt(calc.zakat_base, calc.currency)}</b>',
        body,
    ))
    story.append(Paragraph(
        f'Zakat = base × {rate_pct}&nbsp;% = <b>{_fmt(calc.zakat_amount, calc.currency)}</b>',
        body,
    ))
    story.append(Spacer(1, 8 * mm))

    # Bloc résultat — encart distinct
    result_table = Table(
        [
            [Paragraph('<b>Zakat due</b>', body),
             Paragraph(f'<b>{_fmt(calc.zakat_amount, calc.currency)}</b>', body)],
        ],
        colWidths=[80 * mm, 80 * mm],
    )
    result_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#0F766E')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 13),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]))
    story.append(result_table)
    story.append(Spacer(1, 6 * mm))

    # Seuil de Nisab — verdict d'obligation, ou mention "non configuré".
    story.append(Paragraph('Seuil de Nisab', h2))
    if calc.nisab_threshold is not None:
        method_label = 'argent (595 g)' if calc.nisab_method == 'silver' else 'or (85 g)'
        verdict = (
            'Votre base dépasse le seuil — la zakat est due.'
            if calc.is_above_nisab
            else 'Votre base reste sous le seuil — la zakat n\'est pas obligatoire cette année.'
        )
        story.append(Paragraph(
            f'Méthode <b>{method_label}</b>, prix au gramme '
            f'<b>{_fmt(calc.nisab_unit_price, calc.currency)}</b><br/>'
            f'Seuil retenu&nbsp;: <b>{_fmt(calc.nisab_threshold, calc.currency)}</b><br/>'
            f'{verdict}',
            body,
        ))
    else:
        story.append(Paragraph(
            'Seuil de Nisab non configuré pour cette boutique au moment du calcul. '
            'Impossible de déterminer automatiquement le verdict d\'obligation.',
            small,
        ))
    story.append(Spacer(1, 6 * mm))

    # Exclusions — on liste TOUS les items possibles avec ✓ ou ✗ pour traçabilité complète.
    story.append(Paragraph('Exclus de la base (outils de travail)', h2))
    ack = set(calc.excluded_items_acknowledged or [])
    items_text = '<br/>'.join(
        f'{"✓" if item in ack else "✗"}&nbsp;&nbsp;{_EXCLUDED_LABELS[item]}'
        for item in _EXCLUDED_ORDER
    )
    story.append(Paragraph(items_text, body))
    story.append(Paragraph(
        'Les éléments cochés ont été explicitement reconnus comme hors base par le commerçant.',
        small,
    ))
    story.append(Spacer(1, 6 * mm))

    # Mention indicative — légalement important
    story.append(Paragraph(
        'Document fourni à titre indicatif. Ce calcul ne se substitue pas à l\'avis d\'un '
        'érudit ou d\'un spécialiste de la zakat commerciale. Conservez-le comme trace '
        'de votre déclaration.',
        small,
    ))

    doc.build(story)
    return buf.getvalue()


def _money_table(rows: list[list[str]]) -> Table:
    """Tableau à deux colonnes (label / montant aligné à droite) avec dernière ligne en gras."""
    table = Table(rows, colWidths=[110 * mm, 64 * mm])
    table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.HexColor('#E5E7EB')),
        ('LINEABOVE', (0, -1), (-1, -1), 0.6, colors.HexColor('#9CA3AF')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table
