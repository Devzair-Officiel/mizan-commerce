import factory
from factory.django import DjangoModelFactory

from apps.customers.factories import CustomerFactory
from apps.shops.factories import ShopFactory
from .models import LoyaltyCard, LoyaltyProgram, LoyaltyTransaction


class LoyaltyProgramFactory(DjangoModelFactory):
    class Meta:
        model = LoyaltyProgram
        django_get_or_create = ('shop',)

    shop = factory.SubFactory(ShopFactory)
    is_active = True
    points_per_unit = 1
    redemption_threshold = 100
    redemption_value = factory.Faker('pydecimal', left_digits=2, right_digits=2, positive=True)  # noqa: E501


class LoyaltyCardFactory(DjangoModelFactory):
    class Meta:
        model = LoyaltyCard
        django_get_or_create = ('shop', 'customer')

    shop = factory.SubFactory(ShopFactory)
    customer = factory.SubFactory(CustomerFactory, shop=factory.SelfAttribute('..shop'))
    points_balance = factory.Faker('random_int', min=0, max=500)
    total_points_earned = factory.LazyAttribute(lambda obj: obj.points_balance)
    total_points_redeemed = 0


class LoyaltyTransactionFactory(DjangoModelFactory):
    class Meta:
        model = LoyaltyTransaction

    shop = factory.LazyAttribute(lambda obj: obj.card.shop)
    card = factory.SubFactory(LoyaltyCardFactory)
    transaction_type = LoyaltyTransaction.TYPE_EARN
    points = factory.Faker('random_int', min=1, max=100)
    note = factory.Faker('sentence', nb_words=5, locale='fr_FR')
