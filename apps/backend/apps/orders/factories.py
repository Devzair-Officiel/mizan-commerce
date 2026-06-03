import factory
from factory.django import DjangoModelFactory
from decimal import Decimal

from apps.shops.factories import ShopFactory
from apps.customers.factories import CustomerFactory
from apps.products.factories import ProductVariantFactory
from .models import Order, OrderItem


class OrderFactory(DjangoModelFactory):
    class Meta:
        model = Order

    shop = factory.SubFactory(ShopFactory)
    customer = factory.SubFactory(CustomerFactory, shop=factory.SelfAttribute('..shop'))
    order_number = factory.Sequence(lambda n: f'2026-{n+1:03d}')
    status = 'draft'
    payment_status = 'unpaid'
    subtotal = Decimal('0')
    total_amount = Decimal('0')
    amount_paid = Decimal('0')
    discount_amount = Decimal('0')
    shipping_amount = Decimal('0')


class OrderItemFactory(DjangoModelFactory):
    class Meta:
        model = OrderItem

    shop = factory.SelfAttribute('order.shop')
    order = factory.SubFactory(OrderFactory)
    variant = factory.SubFactory(
        ProductVariantFactory,
        product__shop=factory.SelfAttribute('....shop'),
    )
    product_name = factory.SelfAttribute('variant.product.name')
    variant_name = factory.SelfAttribute('variant.packaging_name')
    unit_price = factory.SelfAttribute('variant.selling_price')
    quantity = factory.Faker('random_int', min=1, max=10)
    line_total = Decimal('0')
