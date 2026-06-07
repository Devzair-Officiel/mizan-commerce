import factory
from django.utils.text import slugify
from factory.django import DjangoModelFactory

from apps.products.factories import ProductFactory
from apps.shops.factories import ShopFactory

from .models import ContactButton, PublicCatalogVisibility, PublicPage, PublicPageSection


class PublicPageFactory(DjangoModelFactory):
    class Meta:
        model = PublicPage
        django_get_or_create = ('shop',)

    shop = factory.SubFactory(ShopFactory)
    slug = factory.LazyAttribute(lambda o: slugify(o.shop.name)[:50] or 'boutique')
    is_active = True
    is_published = True
    display_name = factory.LazyAttribute(lambda o: o.shop.name)
    tagline = factory.Faker('catch_phrase', locale='fr_FR')
    description = factory.Faker('paragraph', nb_sentences=4, locale='fr_FR')
    theme = PublicPage.THEME_CLASSIC
    primary_color = '#0ea5e9'


class PublicPageSectionFactory(DjangoModelFactory):
    class Meta:
        model = PublicPageSection
        django_get_or_create = ('page', 'type')

    page = factory.SubFactory(PublicPageFactory)
    type = PublicPageSection.Type.HEADER
    position = 0
    is_visible = True
    title = ''
    content = ''


class PublicCatalogVisibilityFactory(DjangoModelFactory):
    class Meta:
        model = PublicCatalogVisibility
        django_get_or_create = ('page', 'product')

    page = factory.SubFactory(PublicPageFactory)
    product = factory.SubFactory(ProductFactory)
    position = factory.Sequence(lambda n: n)
    show_price = True
    badge_promo = False
    badge_new = False


class ContactButtonFactory(DjangoModelFactory):
    class Meta:
        model = ContactButton
        django_get_or_create = ('page', 'type')

    page = factory.SubFactory(PublicPageFactory)
    type = ContactButton.Type.WHATSAPP
    value = factory.Faker('msisdn')
    label = ''
    is_primary = False
    is_visible = True
    position = 0
