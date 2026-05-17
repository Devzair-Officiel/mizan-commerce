import factory
from factory.django import DjangoModelFactory

from apps.accounts.factories import UserFactory
from apps.shops.models import Shop, ShopMember


class ShopFactory(DjangoModelFactory):
    class Meta:
        model = Shop
        django_get_or_create = ("name",)

    name = factory.Faker("company", locale="fr_FR")
    currency = "EUR"
    country = "FR"
    timezone = "Europe/Paris"


class ShopMemberFactory(DjangoModelFactory):
    class Meta:
        model = ShopMember
        django_get_or_create = ("shop", "user")

    shop = factory.SubFactory(ShopFactory)
    user = factory.SubFactory(UserFactory)
    role = "owner"
