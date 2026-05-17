import factory
from factory.django import DjangoModelFactory

from apps.accounts.factories import UserFactory
from apps.products.factories import ProductFactory
from .models import StockMovement


class StockMovementFactory(DjangoModelFactory):
    class Meta:
        model = StockMovement

    shop = factory.SelfAttribute("product.shop")
    product = factory.SubFactory(ProductFactory)
    movement_type = "in"
    quantity = factory.Faker("random_int", min=1, max=50)
    reason = factory.Faker("sentence", nb_words=6, locale="fr_FR")
    created_by = factory.SubFactory(UserFactory)
