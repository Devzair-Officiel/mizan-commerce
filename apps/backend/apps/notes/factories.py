import factory
from factory.django import DjangoModelFactory
from django.utils import timezone
from datetime import timedelta

from apps.shops.factories import ShopFactory
from apps.accounts.factories import UserFactory
from .models import Note, Reminder


class NoteFactory(DjangoModelFactory):
    class Meta:
        model = Note

    shop = factory.SubFactory(ShopFactory)
    author = factory.SubFactory(UserFactory)
    content = factory.Faker('paragraph', nb_sentences=2, locale='fr_FR')


class ReminderFactory(DjangoModelFactory):
    class Meta:
        model = Reminder

    shop = factory.SubFactory(ShopFactory)
    author = factory.SubFactory(UserFactory)
    title = factory.Faker('sentence', nb_words=5, locale='fr_FR')
    description = factory.Faker('sentence', nb_words=10, locale='fr_FR')
    due_at = factory.LazyFunction(lambda: timezone.now() + timedelta(days=3))
    category = 'free'
    status = 'pending'
