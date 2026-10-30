"""Seed avoirs (lot 8.2, URS-112) : deux factures émises et leurs avoirs.

- facture de Karima (ligne du catalogue × 2 et ligne libre) : avoir partiel d'un
  article retourné ;
- facture de Hamza (ligne libre) : avoir total, prestation annulée (« Créditée »).

Tout passe par `invoices.drafts` et `invoices.credit_notes` (numéros `fact-…` et
`avoir-…`, instantanés, audit). Importé par seed_data.py. Ne pas exécuter
directement.
"""

from apps.customers.models import Customer
from apps.invoices import credit_notes, drafts
from apps.invoices.compliance import check_invoice
from apps.invoices.models import Invoice

from ._seed_invoices import FREE_LINE, _catalog_line


def _issued(shop, user, customer, lines: list[dict]) -> Invoice:
    """Facture émise ; les recommandations de la boutique de démo sont acceptées."""
    draft = drafts.create_draft_invoice(
        shop, {'customer': customer.pk, 'payment_terms_days': 30, 'lines': lines}
    )
    warnings = [issue.code for issue in check_invoice(draft)]
    return drafts.issue_invoice(draft, user, acknowledged_warnings=warnings)


def _credit(shop, user, invoice: Invoice, lines: list[dict] | None, reason: str):
    warnings = [issue.code for issue in credit_notes.check_credit_note(invoice)]
    return credit_notes.issue_credit_note(
        shop, invoice, lines, reason, user, acknowledged_warnings=warnings
    )


def seed_credit_notes(
    shop, user, customer, catalog_product: str, *, stdout=None
) -> None:
    """Avoir partiel puis avoir total sur deux factures émises. Idempotent."""
    if Invoice.objects.filter(shop=shop, kind=Invoice.KIND_CREDIT_NOTE).exists():
        return
    returned = _issued(
        shop, user, customer, [_catalog_line(shop, catalog_product), FREE_LINE]
    )
    catalog = returned.lines.order_by('position').first()
    _credit(
        shop, user, returned, [{'line': catalog.pk, 'quantity': 1}], 'Article retourné'
    )
    other = Customer.objects.get(shop=shop, name='Hamza Tazi')
    cancelled = _issued(shop, user, other, [FREE_LINE])
    _credit(shop, user, cancelled, None, 'Prestation annulée')
    if stdout:
        stdout.write('    → 2 factures émises, 2 avoirs (partiel, total)')
