import factory
from factory.django import DjangoModelFactory
from django.utils import timezone
from decimal import Decimal

from apps.accounts.factories import UserFactory
from apps.shops.factories import ShopFactory
from . import hawl
from .models import ZakatCalculation, ZakatProfile


class ZakatProfileFactory(DjangoModelFactory):
    """Profil aux choix tous faits (hégirien, seuil or, prix de vente, créances
    chaque année, dettes à 12 mois) ; `ZakatProfileFactory(calendar=None, …)` pour
    un profil incomplet."""

    class Meta:
        model = ZakatProfile
        django_get_or_create = ('shop', 'user')

    shop = factory.SubFactory(ShopFactory)
    user = factory.SubFactory(UserFactory)
    hawl_date = factory.LazyFunction(lambda: timezone.now().date())
    calendar = hawl.CALENDAR_HIJRI
    nisab_method = 'gold'
    nisab_unit_price = Decimal('95.00')
    nisab_price_updated_at = factory.LazyFunction(timezone.now)
    stock_valuation = ZakatProfile.STOCK_VALUATION_SALE
    receivables_mode = ZakatProfile.RECEIVABLES_YEARLY
    debts_mode = ZakatProfile.DEBTS_WITHIN_12_MONTHS
    ownership_share = Decimal('100')


class ZakatCalculationFactory(DjangoModelFactory):
    """Fiche personnelle en année grégorienne. Les montants dérivés (`totals`) se
    calculent à la lecture : passer par `services.create_calculation` pour une fiche
    rafraîchie comme par l'API."""

    class Meta:
        model = ZakatCalculation

    shop = factory.SubFactory(ShopFactory)
    user = factory.SubFactory(UserFactory)
    reference_date = factory.LazyFunction(lambda: timezone.now().date())
    hawl_calendar = hawl.CALENDAR_GREGORIAN
    hawl_year = factory.LazyAttribute(lambda o: hawl.hawl_year(o.reference_date, o.hawl_calendar))  # noqa: E501
    status = ZakatCalculation.STATUS_DRAFT
    current_step = 1
    cash_amount = factory.Faker('pydecimal', left_digits=5, right_digits=2, positive=True)  # noqa: E501
    stock_sale_value = factory.Faker('pydecimal', left_digits=5, right_digits=2, positive=True)  # noqa: E501
    stock_purchase_value = factory.LazyAttribute(lambda o: (o.stock_sale_value * Decimal('0.6')).quantize(Decimal('0.01')))  # noqa: E501
    stock_value_estimated = factory.LazyAttribute(lambda o: o.stock_purchase_value)
    receivable_items = factory.LazyFunction(lambda: [
        {'order_id': None, 'label': 'Avance au fournisseur', 'amount': '400.00', 'doubtful': False},  # noqa: E501
        {'order_id': None, 'label': 'Client parti sans payer', 'amount': '150.00', 'doubtful': True},  # noqa: E501
    ])
    other_assets = factory.LazyFunction(lambda: [
        {'category': 'personal_cash', 'label': 'Épargne personnelle', 'amount': '2000.00', 'counted': True},  # noqa: E501
    ])
    debt_items = factory.LazyFunction(lambda: [
        {'category': 'supplier', 'label': 'Fournisseur principal', 'amount': '500.00', 'amount_within_12_months': '500.00'},  # noqa: E501
        {'category': 'loan', 'label': 'Paiement échelonné', 'amount': '5000.00', 'amount_within_12_months': '1200.00'},  # noqa: E501
    ])
    currency = 'EUR'
