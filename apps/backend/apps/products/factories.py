import factory
from factory.django import DjangoModelFactory

from apps.shops.factories import ShopFactory
from .models import Product, ProductImage, ProductVariant


class ProductFactory(DjangoModelFactory):
    class Meta:
        model = Product

    shop = factory.SubFactory(ShopFactory)
    name = factory.Sequence(lambda n: f"Produit {n}")
    description = factory.Faker("sentence", nb_words=12, locale="fr_FR")
    is_active = True

    @factory.post_generation
    def with_default_variant(self, create, extracted, **kwargs):
        """Crée systématiquement une variante "Par défaut" (sauf si désactivé)."""
        if not create:
            return
        if extracted is False:
            return
        if self.variants.exists():
            return
        ProductVariant.objects.create(
            shop=self.shop,
            product=self,
            packaging_name="Par défaut",
            unit="piece",
            base_quantity=1,
            selling_price=20,
            purchase_price=10,
            low_stock_threshold=5,
            sku="",
            position=0,
            is_active=True,
        )


class ProductVariantFactory(DjangoModelFactory):
    class Meta:
        model = ProductVariant

    shop = factory.SelfAttribute("product.shop")
    product = factory.SubFactory(ProductFactory, with_default_variant=False)
    packaging_name = factory.Sequence(lambda n: f"Conditionnement {n}")
    unit = "piece"
    base_quantity = 1
    selling_price = factory.Faker("pydecimal", left_digits=2, right_digits=2, positive=True, min_value=10, max_value=150)
    purchase_price = factory.Faker("pydecimal", left_digits=2, right_digits=2, positive=True, min_value=5, max_value=50)
    low_stock_threshold = 5
    position = 0
    is_active = True


class ProductImageFactory(DjangoModelFactory):
    class Meta:
        model = ProductImage

    shop = factory.SelfAttribute("product.shop")
    product = factory.SubFactory(ProductFactory)
    object_key = factory.Sequence(lambda n: f"products/images/product_{n}.jpg")
    is_primary = False
    position = factory.Sequence(lambda n: n)
