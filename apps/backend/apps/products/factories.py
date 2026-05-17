import factory
from factory.django import DjangoModelFactory

from apps.shops.factories import ShopFactory
from .models import Product, ProductImage


class ProductFactory(DjangoModelFactory):
    class Meta:
        model = Product
        django_get_or_create = ("shop", "reference")

    shop = factory.SubFactory(ShopFactory)
    name = factory.Faker("catch_phrase", locale="fr_FR")
    reference = factory.Sequence(lambda n: f"REF-{n:04d}")
    description = factory.Faker("sentence", nb_words=12, locale="fr_FR")
    purchase_price = factory.Faker("pydecimal", left_digits=2, right_digits=2, positive=True, min_value=5, max_value=50)
    selling_price = factory.Faker("pydecimal", left_digits=2, right_digits=2, positive=True, min_value=10, max_value=150)
    low_stock_threshold = factory.Faker("random_int", min=2, max=5)
    is_active = True


class ProductImageFactory(DjangoModelFactory):
    class Meta:
        model = ProductImage

    shop = factory.SelfAttribute("product.shop")
    product = factory.SubFactory(ProductFactory)
    object_key = factory.Sequence(lambda n: f"products/images/product_{n}.jpg")
    is_primary = False
    position = factory.Sequence(lambda n: n)
