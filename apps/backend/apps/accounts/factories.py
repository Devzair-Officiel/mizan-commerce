import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import User


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        django_get_or_create = ("email",)

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name", locale="fr_FR")
    phone = factory.Faker("phone_number", locale="fr_FR")
    is_active = True

    @classmethod
    def _create(cls, model_class: type, *args, **kwargs) -> User:
        password = kwargs.pop("password", "SeedPass123!")
        email = kwargs.get("email")
        if email:
            existing = model_class.objects.filter(email=email).first()
            if existing:
                return existing
        return model_class.objects.create_user(*args, password=password, **kwargs)
