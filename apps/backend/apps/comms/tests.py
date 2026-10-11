from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.factories import CustomerFactory
from apps.customers.models import Customer
from apps.orders.factories import OrderFactory
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import Subscription, SubscriptionPlan

from .factories import PreparedMessageFactory
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


class MessageHistoryTest(TestCase):
    """Historique des fiches : messages d'un client (y compris ceux de ses
    commandes) et messages d'une commande."""

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
        self.customer = CustomerFactory(shop=self.shop, phone='+33612345678')
        self.order = OrderFactory(shop=self.shop, customer=self.customer)
        self.client.force_authenticate(user=user)

    def send(self, context_type: str, context_id, **extra) -> dict:
        payload = {
            'template_type': 'free',
            'context_type': context_type,
            'context_id': str(context_id),
            'custom_message': 'Bonjour, votre commande est prête.',
            'sent': True,
            **extra,
        }
        response = self.client.post(reverse('prepared-message-list'), payload, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def listed(self, **params) -> list[str]:
        response = self.client.get(reverse('prepared-message-list'), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [m['id'] for m in response.data['results']]

    def test_sent_message_is_recorded_as_sent(self):
        data = self.send('order', self.order.id)
        self.assertEqual(data['status'], PreparedMessage.Status.SENT_MANUALLY)
        self.assertIsNotNone(data['sent_manually_at'])
        self.assertEqual(data['customer'], self.customer.id)

    def test_customer_history_includes_order_messages(self):
        from_order = self.send('order', self.order.id)['id']
        from_sheet = self.send('customer', self.customer.id)['id']
        other = CustomerFactory(shop=self.shop)
        self.send('customer', other.id)
        listed = self.listed(customer=self.customer.id)
        self.assertCountEqual(listed, [from_order, from_sheet])

    def test_order_history_lists_only_that_order(self):
        from_order = self.send('order', self.order.id)['id']
        self.send('customer', self.customer.id)
        other_order = OrderFactory(shop=self.shop, customer=self.customer)
        self.send('order', other_order.id)
        self.assertEqual(self.listed(order=self.order.id), [from_order])

    def test_other_shop_messages_are_not_listed(self):
        other_shop = Shop.objects.create(name='Autre', country='FR')
        PreparedMessageFactory(
            shop=other_shop,
            customer=self.customer,
            context_type=PreparedMessage.ContextType.ORDER,
            context_id=self.order.id,
        )
        self.assertEqual(self.listed(customer=self.customer.id), [])
        self.assertEqual(self.listed(order=self.order.id), [])
