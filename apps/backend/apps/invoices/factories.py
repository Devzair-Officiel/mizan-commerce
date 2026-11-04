from decimal import Decimal

import factory
from django.db.models import F
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.shops.factories import ShopFactory
from .models import DocumentSequence, Invoice, InvoiceLine


class DocumentSequenceFactory(DjangoModelFactory):
    class Meta:
        model = DocumentSequence
        django_get_or_create = ('shop', 'kind')

    shop = factory.SubFactory(ShopFactory)
    kind = DocumentSequence.KIND_INVOICE
    last_number = 0


class InvoiceFactory(DjangoModelFactory):
    """Brouillon par défaut (sans numéro ni date) ; `issued=True` pour une émise.

    Avoirs (URS-112) : `partial_credit=True` (40,00 sur une facture de 120,00) ou
    `total_credit=True` (tout le TTC), sur une facture émise de la même boutique
    créée au passage (ou `credited_invoice=…`). Le `credited_total` de la facture
    d'origine est relevé comme le fait `credit_notes.issue_credit_note`.

    Les totaux ne sont pas recalculés : les services de `drafts` le font.
    """

    class Meta:
        model = Invoice
        skip_postgeneration_save = True

    class Params:
        issued = factory.Trait(
            status=Invoice.STATUS_ISSUED,
            number=factory.Sequence(lambda n: f'fact-{n + 1:04d}'),
            issued_at=factory.LazyFunction(timezone.now),
        )
        credit_note = factory.Trait(
            kind=Invoice.KIND_CREDIT_NOTE,
            status=Invoice.STATUS_ISSUED,
            number=factory.Sequence(lambda n: f'avoir-{n + 1:04d}'),
            issued_at=factory.LazyFunction(timezone.now),
            credited_invoice=factory.SubFactory(
                'apps.invoices.factories.InvoiceFactory',
                shop=factory.SelfAttribute('..shop'),
                issued=True,
                total_ttc=Decimal('120.00'),
            ),
            credit_reason='Retour client',
            presentation=factory.LazyAttribute(
                lambda o: {
                    'credited_number': o.credited_invoice.number,
                    'credited_issued_date': o.credited_invoice.issued_at.date().isoformat(),  # noqa: E501
                }
            ),
        )
        partial_credit = factory.Trait(credit_note=True, total_ttc=Decimal('40.00'))
        total_credit = factory.Trait(
            credit_note=True,
            total_ttc=factory.SelfAttribute('credited_invoice.total_ttc'),
        )

    shop = factory.SubFactory(ShopFactory)
    status = Invoice.STATUS_DRAFT
    number = ''
    currency = factory.SelfAttribute('shop.currency')
    seller_name = factory.SelfAttribute('shop.name')
    seller_country = factory.SelfAttribute('shop.country')
    buyer_name = factory.Faker('name', locale='fr_FR')

    @factory.post_generation
    def credit(self, create: bool, extracted: object, **kwargs: object) -> None:
        """Avoir : relève le montant crédité de la facture d'origine."""
        if not create or self.credited_invoice_id is None:
            return
        Invoice.objects.filter(
            pk=self.credited_invoice_id, shop_id=self.shop_id
        ).update(credited_total=F('credited_total') + self.total_ttc)
        self.credited_invoice.refresh_from_db()


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
