"""Fabriques des devis (URS-111) : brouillon par défaut, un trait par état.

Les totaux ne sont pas recalculés et aucun compteur `DocumentSequence` n'est
consommé : les services de `quotes.services` le font.
"""

from datetime import timedelta
from decimal import Decimal

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.invoices.factories import InvoiceFactory
from apps.shops.factories import ShopFactory

from .models import Quote, QuoteLine


def _sent_traits(status: str, **extra: object) -> factory.Trait:
    """Devis envoyé il y a dix jours (sauf `extra`), valable trente jours."""
    declarations = {
        'status': status,
        'number': factory.Sequence(lambda n: f'devis-{n + 1:04d}'),
        'sent_at': factory.LazyFunction(lambda: timezone.now() - timedelta(days=10)),
        'valid_until': factory.LazyAttribute(
            lambda o: o.sent_at.date() + timedelta(days=o.validity_days)
        ),
    }
    return factory.Trait(**{**declarations, **extra})


class QuoteFactory(DjangoModelFactory):
    """Brouillon par défaut (sans numéro ni date d'envoi) ; un trait par état :
    `sent`, `accepted`, `declined`, `expired`, `invoiced`."""

    class Meta:
        model = Quote

    class Params:
        sent = _sent_traits(Quote.STATUS_SENT)
        accepted = _sent_traits(
            Quote.STATUS_ACCEPTED,
            accepted_at=factory.LazyFunction(timezone.now),
            accepted_name=factory.Faker('name', locale='fr_FR'),
        )
        declined = _sent_traits(
            Quote.STATUS_DECLINED, declined_at=factory.LazyFunction(timezone.now)
        )
        # Validité passée : envoyé il y a quarante jours pour trente jours.
        expired = _sent_traits(
            Quote.STATUS_EXPIRED,
            sent_at=factory.LazyFunction(lambda: timezone.now() - timedelta(days=40)),
        )
        invoiced = _sent_traits(
            Quote.STATUS_INVOICED,
            accepted_at=factory.LazyFunction(timezone.now),
            invoice=factory.SubFactory(
                InvoiceFactory, shop=factory.SelfAttribute('..shop')
            ),
        )

    shop = factory.SubFactory(ShopFactory)
    status = Quote.STATUS_DRAFT
    number = ''
    validity_days = Quote.DEFAULT_VALIDITY_DAYS
    currency = factory.SelfAttribute('shop.currency')
    seller_name = factory.SelfAttribute('shop.name')
    seller_country = factory.SelfAttribute('shop.country')
    buyer_name = factory.Faker('name', locale='fr_FR')


class QuoteLineFactory(DjangoModelFactory):
    class Meta:
        model = QuoteLine

    shop = factory.SelfAttribute('quote.shop')
    quote = factory.SubFactory(QuoteFactory)
    description = factory.Faker('sentence', nb_words=4, locale='fr_FR')
    details = ''
    unit = ''
    position = factory.Sequence(lambda n: n)
    quantity = Decimal('1')
    unit_price_ht = Decimal('50.00')
    line_subtotal_ht = factory.LazyAttribute(
        lambda o: (o.quantity * o.unit_price_ht).quantize(Decimal('0.01'))
    )
