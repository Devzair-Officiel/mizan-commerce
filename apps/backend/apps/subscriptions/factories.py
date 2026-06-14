from datetime import timedelta
from decimal import Decimal

import factory
from django.utils import timezone

from apps.shops.factories import ShopFactory

from .models import Subscription, SubscriptionPlan


class SubscriptionPlanFactory(factory.django.DjangoModelFactory):
    """Factory pour SubscriptionPlan. Pour le seed des 3 plans canoniques,
    utiliser `seed_plans` (management command) plutôt que cette factory."""

    class Meta:
        model = SubscriptionPlan
        django_get_or_create = ('code',)

    code = factory.Sequence(lambda n: f'plan_{n}')
    name = factory.LazyAttribute(lambda obj: obj.code.replace('_', ' ').title())
    price_amount = factory.Faker('pydecimal', left_digits=3, right_digits=2, positive=True)
    currency = 'EUR'
    billing_period = SubscriptionPlan.PERIOD_MONTH
    is_active = True


class SubscriptionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Subscription

    shop = factory.SubFactory(ShopFactory)
    plan = factory.SubFactory(SubscriptionPlanFactory)
    status = Subscription.STATUS_ACTIVE
    current_period_start = factory.LazyFunction(timezone.now)
    cancel_at_period_end = False


class TrialingSubscriptionFactory(SubscriptionFactory):
    """Variante : abonnement en essai 14 jours (par défaut, plan Boutique+)."""

    status = Subscription.STATUS_TRIALING
    plan = factory.SubFactory(
        SubscriptionPlanFactory,
        code=SubscriptionPlan.CODE_BOUTIQUE_PLUS,
        price_amount=Decimal('19'),
    )
    current_period_end = factory.LazyFunction(
        lambda: timezone.now() + timedelta(days=14),
    )
