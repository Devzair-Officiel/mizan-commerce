import factory
from factory.django import DjangoModelFactory
from django.utils import timezone
from decimal import Decimal

from apps.shops.factories import ShopFactory
from .models import ZakatCalculation


class ZakatCalculationFactory(DjangoModelFactory):
    class Meta:
        model = ZakatCalculation

    shop = factory.SubFactory(ShopFactory)
    reference_date = factory.LazyFunction(lambda: timezone.now().date())
    status = ZakatCalculation.STATUS_FINALIZED
    current_step = 5
    cash_amount = factory.Faker('pydecimal', left_digits=5, right_digits=2, positive=True)
    has_receivables = True
    receivables_nominal = factory.Faker('pydecimal', left_digits=4, right_digits=2, positive=True)
    receivables_amount = factory.LazyAttribute(lambda o: o.receivables_nominal * Decimal('0.9'))
    stock_value_estimated = factory.Faker('pydecimal', left_digits=6, right_digits=2, positive=True)
    excluded_items_acknowledged = factory.LazyFunction(lambda: ['vehicle', 'furniture'])
    debts_breakdown = factory.LazyFunction(lambda: [
        {'category': 'supplier', 'label': 'Fournisseur principal', 'amount': '500.00', 'is_immediately_due': True},
        {'category': 'loan', 'label': 'Emprunt long terme', 'amount': '5000.00', 'is_immediately_due': False},
    ])
    short_term_debts = Decimal('500.00')
    zakat_rate = Decimal('0.0250')
    zakat_base = factory.LazyAttribute(
        lambda o: max(
            Decimal('0'),
            o.stock_value_estimated + o.cash_amount + o.receivables_amount - o.short_term_debts,
        )
    )
    zakat_amount = factory.LazyAttribute(lambda o: (o.zakat_base * o.zakat_rate).quantize(Decimal('0.01')))
    currency = 'EUR'
    finalized_at = factory.LazyFunction(timezone.now)
