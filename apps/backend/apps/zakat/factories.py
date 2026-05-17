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
    stock_value_estimated = factory.Faker('pydecimal', left_digits=6, right_digits=2, positive=True)
    cash_amount = factory.Faker('pydecimal', left_digits=5, right_digits=2, positive=True)
    receivables_amount = factory.Faker('pydecimal', left_digits=4, right_digits=2, positive=True)
    short_term_debts = factory.Faker('pydecimal', left_digits=4, right_digits=2, positive=True)
    zakat_base = factory.LazyAttribute(
        lambda o: o.stock_value_estimated + o.cash_amount + o.receivables_amount - o.short_term_debts
    )
    zakat_rate = Decimal('0.0250')
    zakat_amount = factory.LazyAttribute(lambda o: (o.zakat_base * o.zakat_rate).quantize(Decimal('0.01')))
    currency = 'EUR'
