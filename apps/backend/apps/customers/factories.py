import factory
from factory.django import DjangoModelFactory

from apps.shops.factories import ShopFactory
from .models import Customer


class CustomerFactory(DjangoModelFactory):
    class Meta:
        model = Customer
        django_get_or_create = ("shop", "phone")

    shop = factory.SubFactory(ShopFactory)
    name = factory.Faker("name", locale="fr_FR")
    phone = factory.Faker("phone_number", locale="fr_FR")
    email = factory.Faker("email", locale="fr_FR")
    address_line = factory.Faker("street_address", locale="fr_FR")
    city = factory.Faker("city", locale="fr_FR")
    postal_code = factory.Faker("postcode", locale="fr_FR")
    country = "FR"
    notes = factory.Faker("sentence", nb_words=8, locale="fr_FR")
    is_active = True
