"""Vérification avant envoi d'un devis (URS-111), sur le modèle de la facture libre.

`check_quote` est pure : elle lit le devis, sa boutique et son client, n'écrit
rien. Les contrôles « recommandés » ne disent jamais qu'un devis est conforme :
ils signalent ce qui figure normalement sur un devis en France, et ne
s'appliquent qu'aux boutiques établies en France. Un brouillon n'a pas encore
d'instantané vendeur : les informations sont lues sur la boutique.

Toujours présents par construction, donc jamais signalés : date d'envoi, durée
de validité (1 à 365 jours), délai de paiement, détail des lignes avec prix
unitaires, taux de TVA et totaux HT et TTC. Le caractère gratuit du devis et la
zone « bon pour accord » sont imprimés par le PDF.
"""

from collections.abc import Collection
from decimal import Decimal

from apps.invoices.compliance import ComplianceIssue
from apps.invoices.drafts import ComplianceError

from .models import Quote


def _blocking(quote: Quote) -> list[ComplianceIssue]:
    shop = quote.shop
    issues = []
    if not quote.lines.exists():
        issues.append(ComplianceIssue('no_lines', 'blocking', 'lines'))
    elif quote.total_ttc <= Decimal('0'):
        issues.append(ComplianceIssue('zero_total', 'blocking', 'lines'))
    if quote.customer_id is None:
        issues.append(ComplianceIssue('no_customer', 'blocking', 'customer'))
    if not (shop.name.strip() and shop.legal_address.strip()):
        issues.append(
            ComplianceIssue('seller_identity', 'blocking', 'invoice_settings')
        )
    return issues


def _recommended_fr(quote: Quote) -> list[ComplianceIssue]:
    shop = quote.shop
    applicable = shop.invoice_vat_regime == 'applicable'
    checks = [
        (
            'seller_identifier',
            'invoice_settings',
            not (shop.siret.strip() or shop.tax_id.strip()),
        ),
        ('vat_number', 'invoice_settings', applicable and not shop.vat_number.strip()),
        # TVA applicable mais taux nul : totaux TTC probablement faux.
        ('zero_tax_rate', 'invoice_settings', applicable and quote.tax_rate == 0),
        # Conditions de paiement : moyens acceptés (le délai a toujours une valeur).
        ('payment_methods', 'invoice_settings', not shop.invoice_payment_methods),
    ]
    return [
        ComplianceIssue(code, 'recommended', target)
        for code, target, missing in checks
        if missing
    ]


def check_quote(quote: Quote) -> list[ComplianceIssue]:
    """Points bloquants puis recommandés, dans l'ordre d'affichage."""
    issues = _blocking(quote)
    if quote.shop.country == 'FR':
        issues += _recommended_fr(quote)
    return issues


def verify_quote(quote: Quote, acknowledged: Collection[str]) -> list[str]:
    """Codes des recommandations acceptées ; refus si un point reste ouvert."""
    issues = check_quote(quote)
    if any(issue.level == 'blocking' for issue in issues):
        raise ComplianceError(issues, blocking=True)
    if any(issue.code not in acknowledged for issue in issues):
        raise ComplianceError(issues, blocking=False)
    return [issue.code for issue in issues]
