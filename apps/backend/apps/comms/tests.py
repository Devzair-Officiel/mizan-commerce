from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import Subscription, SubscriptionPlan

from .models import PreparedMessage


class CustomerFollowupTest(TestCase):
    """« Relancer » depuis la fiche client : relance avec un contexte client."""

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(email='seller@example.com', password='Pass123!Strong')  # noqa: E501
        self.shop = Shop.objects.create(name='Boutique', country='FR')
        ShopMember.objects.create(shop=self.shop, user=user, role='owner')
        Subscription.objects.create(
            shop=self.shop,
            plan=SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_BOUTIQUE_PLUS),
            status=Subscription.STATUS_ACTIVE,
            current_period_start=timezone.now(),
        )
        self.customer = Customer.objects.create(shop=self.shop, name='Nadia', phone='+33612345678')  # noqa: E501
        self.client.force_authenticate(user=user)

    def post(self, **overrides):
        payload = {
            'template_type': 'unpaid_followup',
            'context_type': 'customer',
            'context_id': str(self.customer.id),
            'customer_id': str(self.customer.id),
            'custom_message': 'Bonjour Nadia, il reste 29,00 € sur vos commandes.',
            **overrides,
        }
        return self.client.post(reverse('prepared-message-list'), payload, format='json')  # noqa: E501

    def test_followup_with_customer_context_and_message(self):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        message = PreparedMessage.objects.get(shop=self.shop)
        self.assertEqual(message.customer, self.customer)
        self.assertEqual(message.recipient_phone, '+33612345678')
        self.assertTrue(message.message.startswith('Bonjour Nadia'))

    def test_followup_with_customer_context_requires_message(self):
        response = self.post(custom_message='')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_followup_from_another_shop_customer_is_refused(self):
        other = Shop.objects.create(name='Autre')
        stranger = Customer.objects.create(shop=other, name='Inconnu', phone='+33611111111')  # noqa: E501
        response = self.post(context_id=str(stranger.id), customer_id=str(stranger.id))
        self.assertNotEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(PreparedMessage.objects.exists())
