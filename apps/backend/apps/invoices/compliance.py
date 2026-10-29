"""Vérification avant émission d'une facture libre (URS-110).

Fonction pure : lit la facture, sa boutique et son client, n'écrit rien. Les
contrôles « recommandés » ne disent jamais qu'une facture est conforme : ils
signalent ce qui figure normalement sur une facture officielle en France, et ne
s'appliquent qu'aux boutiques établies en France. Un brouillon n'a pas encore
d'instantané vendeur : les informations sont lues sur la boutique.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from .models import Invoice

Level = Literal['blocking', 'recommended']


@dataclass(frozen=True)
class ComplianceIssue:
    code: str
    level: Level
    # Champ ou écran à compléter : `lines`, `customer`, `invoice_settings`.
    target: str


def _blocking(invoice: Invoice) -> list[ComplianceIssue]:
    issues = []
    if not invoice.lines.exists():
        issues.append(ComplianceIssue('no_lines', 'blocking', 'lines'))
    elif invoice.total_ttc <= Decimal('0'):
        issues.append(ComplianceIssue('zero_total', 'blocking', 'lines'))
    if invoice.customer_id is None:
        issues.append(ComplianceIssue('no_customer', 'blocking', 'customer'))
    return issues


def _recommended_fr(invoice: Invoice) -> list[ComplianceIssue]:
    shop = invoice.shop
    business = (
        invoice.customer is not None and invoice.customer.customer_type == 'business'
    )
    checks = [
        ('seller_address', 'invoice_settings', not shop.legal_address.strip()),
        (
            'seller_identifier',
            'invoice_settings',
            not (shop.siret.strip() or shop.tax_id.strip()),
        ),
        (
            'vat_number',
            'invoice_settings',
            shop.invoice_vat_regime == 'applicable' and not shop.vat_number.strip(),
        ),
        ('customer_siren', 'customer', business and not invoice.customer.siren),
        # Pénalités de retard et indemnité forfaitaire : pas encore de champ dédié,
        # des mentions légales vides en sont le signal.
        (
            'late_penalties',
            'invoice_settings',
            business and not shop.legal_mentions.strip(),
        ),
    ]
    return [
        ComplianceIssue(code, 'recommended', target)
        for code, target, missing in checks
        if missing
    ]


def check_invoice(invoice: Invoice) -> list[ComplianceIssue]:
    """Points bloquants puis recommandés, dans l'ordre d'affichage."""
    issues = _blocking(invoice)
    if invoice.shop.country == 'FR':
        issues += _recommended_fr(invoice)
    return issues
