import factory
from factory.django import DjangoModelFactory

from apps.customers.factories import CustomerFactory
from apps.shops.factories import ShopFactory

from .models import PreparedMessage


class PreparedMessageFactory(DjangoModelFactory):
    class Meta:
        model = PreparedMessage

    shop = factory.SubFactory(ShopFactory)
    customer = factory.SubFactory(CustomerFactory, shop=factory.SelfAttribute('..shop'))
    template_type = PreparedMessage.TemplateType.ORDER_CONFIRMATION
    context_type = PreparedMessage.ContextType.NONE
    context_id = None
    recipient_name = factory.LazyAttribute(lambda o: o.customer.name if o.customer else '')
    recipient_phone = factory.LazyAttribute(lambda o: o.customer.phone if o.customer else '')
    message = factory.Faker('paragraph', nb_sentences=3, locale='fr_FR')
    status = PreparedMessage.Status.PREPARED
