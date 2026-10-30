"""Seed devis (lot 8.2, URS-111) : un devis par état pour la boutique de démo.

- deux brouillons : complet (ligne du catalogue et ligne libre), vide ;
- envoyé, accepté (signataire), refusé, expiré (envoi antidaté) ;
- facturé : accepté puis converti en facture brouillon (liée au devis).

Tout passe par `quotes.services` (numéros `devis-…`, instantanés, audit), sauf
l'antidatage du devis expiré. Importé par seed_data.py. Ne pas exécuter
directement.
"""

from datetime import date, timedelta

from apps.customers.models import Customer
from apps.quotes import services
from apps.quotes.compliance import check_quote
from apps.quotes.models import Quote

from ._seed_invoices import FREE_LINE, _catalog_line


def _sent(shop, user, customer, lines: list[dict]) -> Quote:
    """Brouillon envoyé ; les recommandations de la boutique de démo sont acceptées."""
    quote = services.create_draft_quote(shop, {'customer': customer.pk, 'lines': lines})
    warnings = [issue.code for issue in check_quote(quote)]
    return services.send_quote(quote, user, acknowledged_warnings=warnings)


def _expire(quote: Quote, days_ago: int) -> None:
    """Envoi antidaté de `days_ago` jours : validité passée, devis expiré."""
    shift = timedelta(days=days_ago)
    sent_on = date.fromisoformat(quote.presentation['sent_date']) - shift
    valid_until = sent_on + timedelta(days=quote.validity_days)
    presentation = {
        **quote.presentation,
        'sent_date': sent_on.isoformat(),
        'valid_until': valid_until.isoformat(),
    }
    Quote.objects.filter(
        pk=quote.pk, shop=quote.shop_id, status=Quote.STATUS_SENT
    ).update(
        status=Quote.STATUS_EXPIRED,
        sent_at=quote.sent_at - shift,
        valid_until=valid_until,
        presentation=presentation,
    )


def seed_quotes(shop, user, customer, catalog_product: str, *, stdout=None) -> None:
    """Sept devis, un par état (deux brouillons). Idempotent."""
    if Quote.objects.filter(shop=shop).exists():
        return
    other = Customer.objects.get(shop=shop, name='Hamza Tazi')
    services.create_draft_quote(
        shop,
        {
            'customer': customer.pk,
            'validity_days': 15,
            'notes': 'Devis valable 15 jours.',
            'lines': [_catalog_line(shop, catalog_product), FREE_LINE],
        },
    )
    services.create_draft_quote(shop, {})
    _sent(shop, user, other, [FREE_LINE])
    accepted = _sent(shop, user, customer, [FREE_LINE])
    services.mark_accepted_manually(accepted, user, customer.name)
    services.mark_declined(_sent(shop, user, other, [FREE_LINE]), user)
    _expire(_sent(shop, user, customer, [FREE_LINE]), days_ago=45)
    invoiced = _sent(shop, user, customer, [_catalog_line(shop, catalog_product)])
    services.convert_quote_to_invoice(
        services.mark_accepted_manually(invoiced, user, customer.name), user
    )
    if stdout:
        stdout.write(
            '    → 7 devis (2 brouillons, envoyé, accepté, refusé, expiré, facturé)'
        )
