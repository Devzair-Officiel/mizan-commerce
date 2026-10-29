from decimal import Decimal

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.shops.factories import ShopFactory
from .models import Invoice, InvoiceLine, InvoiceSequence


class InvoiceSequenceFactory(DjangoModelFactory):
    class Meta:
        model = InvoiceSequence
        django_get_or_create = ('shop',)

    shop = factory.SubFactory(ShopFactory)
    last_number = 0


class InvoiceFactory(DjangoModelFactory):
    """Brouillon par défaut (sans numéro ni date) ; `issued=True` pour une émise.

    Les totaux ne sont pas recalculés : les services de `drafts` le font.
    """

    class Meta:
        model = Invoice

    class Params:
        issued = factory.Trait(
            status=Invoice.STATUS_ISSUED,
            number=factory.Sequence(lambda n: f'fact-{n + 1:04d}'),
            issued_at=factory.LazyFunction(timezone.now),
        )

    shop = factory.SubFactory(ShopFactory)
    status = Invoice.STATUS_DRAFT
    number = ''
    currency = factory.SelfAttribute('shop.currency')
    seller_name = factory.SelfAttribute('shop.name')
    seller_country = factory.SelfAttribute('shop.country')
    buyer_name = factory.Faker('name', locale='fr_FR')


class InvoiceLineFactory(DjangoModelFactory):
    class Meta:
        model = InvoiceLine

    shop = factory.SelfAttribute('invoice.shop')
    invoice = factory.SubFactory(InvoiceFactory)
    description = factory.Faker('sentence', nb_words=4, locale='fr_FR')
    details = ''
    unit = ''
    position = factory.Sequence(lambda n: n)
    quantity = Decimal('1')
    unit_price_ht = Decimal('50.00')
    line_subtotal_ht = factory.LazyAttribute(
        lambda o: (o.quantity * o.unit_price_ht).quantize(Decimal('0.01'))
    )
