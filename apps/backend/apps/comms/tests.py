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


class MessageTemplatesTest(TestCase):
    """Modèles de messages (URS-066/067) : ton, textes, variables, droits."""

    VARS = '{client}|{commande}|{date}|{total}|{reste}|{articles}|{boutique}'

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(email='owner@example.com', password='Pass123!Strong')  # noqa: E501
        self.shop = self.make_shop('Lin & Co', self.owner)
        self.customer = Customer.objects.create(
            shop=self.shop, first_name='Karima', name='Bensouda', phone='+33612345678',
        )
        self.order = self.make_order(self.shop, self.customer, '2025-054')
        self.client.force_authenticate(user=self.owner)

    @staticmethod
    def make_shop(name, owner, plan=SubscriptionPlan.CODE_BOUTIQUE_PLUS):
        shop = Shop.objects.create(name=name, country='FR')
        ShopMember.objects.create(shop=shop, user=owner, role='owner')
        Subscription.objects.create(
            shop=shop,
            plan=SubscriptionPlan.objects.get(code=plan),
            status=Subscription.STATUS_ACTIVE,
            current_period_start=timezone.now(),
        )
        return shop

    @staticmethod
    def make_order(shop, customer, number, *, paid='10.00', status='to_prepare',
                   payment_status='partial', created_at=None):
        from datetime import UTC, datetime

        from apps.orders.models import Order, OrderItem

        order = Order.objects.create(
            shop=shop, customer=customer, order_number=number, status=status,
            payment_status=payment_status, total_amount='44.97', amount_paid=paid,
        )
        OrderItem.objects.create(shop=shop, order=order, product_name='Savon', unit_price='9.99', quantity=2)  # noqa: E501
        OrderItem.objects.create(shop=shop, order=order, product_name='Huile', unit_price='24.99', quantity=1)  # noqa: E501
        # 31 mars 2025, 22:30 UTC : déjà le 1er avril à Paris.
        at = created_at or datetime(2025, 3, 31, 22, 30, tzinfo=UTC)
        Order.objects.filter(pk=order.pk).update(created_at=at)
        order.refresh_from_db()
        return order

    def compose(self, **payload):
        return self.client.post(reverse('message-compose'), payload, format='json')

    def patch(self, payload):
        return self.client.patch(reverse('message-settings'), payload, format='json')

    def preview(self, text, **extra):
        return self.client.post(reverse('message-preview'), {'text': text, **extra}, format='json')  # noqa: E501

    def set_text(self, template, text):
        from .services import get_message_settings

        settings = get_message_settings(self.shop)
        settings.custom_texts = {template: text}
        settings.save()

    # ── Rendu ──────────────────────────────────────────────────────────

    def test_each_variable_is_rendered_in_shop_format(self):
        self.set_text('unpaid_followup', self.VARS)
        data = self.compose(order_id=str(self.order.id), template='unpaid_followup', lang='fr').data  # noqa: E501
        self.assertEqual(data['message'].split('|'), [
            'Karima',
            '⁦2025-054⁩',
            '1 avr. 2025',
            '44,97\xa0€',
            '34,97\xa0€',
            '2 × Savon et 1 × Huile',
            'Lin & Co',
        ])

    def test_amounts_and_lists_follow_language(self):
        self.set_text('unpaid_followup', '{reste} — {articles}')
        data = self.compose(order_id=str(self.order.id), template='unpaid_followup', lang='en').data  # noqa: E501
        self.assertEqual(data['message'], '€34.97 — 2 × Savon and 1 × Huile')

    def test_default_tone_is_warm_with_first_name(self):
        data = self.compose(order_id=str(self.order.id), template='unpaid_followup', lang='fr').data  # noqa: E501
        self.assertTrue(data['message'].startswith('Bonjour Karima 😊\nPetit rappel'))
        self.assertIn('il reste 34,97\xa0€ à régler', data['message'])
        self.assertTrue(data['message'].endswith('Lin & Co'))

    def test_professional_tone_uses_full_name(self):
        self.assertEqual(self.patch({'tone': 'professional'}).status_code, 200)
        data = self.compose(order_id=str(self.order.id), template='unpaid_followup', lang='fr').data  # noqa: E501
        self.assertTrue(data['message'].startswith('Bonjour Karima Bensouda,\nSauf erreur'))  # noqa: E501

    def test_custom_text_then_reset(self):
        response = self.patch({'texts': {'unpaid_followup': '  Coucou {client}, reste {reste}  '}})  # noqa: E501
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['texts'], {'unpaid_followup': 'Coucou {client}, reste {reste}'})  # noqa: E501
        message = self.compose(order_id=str(self.order.id), template='unpaid_followup').data['message']  # noqa: E501
        self.assertEqual(message, 'Coucou Karima, reste 34,97\xa0€')

        response = self.patch({'texts': {'unpaid_followup': None}})
        self.assertEqual(response.data['texts'], {})
        message = self.compose(order_id=str(self.order.id), template='unpaid_followup').data['message']  # noqa: E501
        self.assertTrue(message.startswith('Bonjour Karima 😊'))

    def test_unknown_variable_is_refused_with_allowed_list(self):
        response = self.patch({'texts': {'promo': 'Salut {prenom} et {client}'}})
        self.assertEqual(response.status_code, 400)
        self.assertIn('{prenom}', response.data['errors']['texts']['promo'][0])
        self.assertEqual(response.data['allowed_variables'], [
            '{client}', '{commande}', '{date}', '{total}', '{reste}', '{articles}', '{boutique}',  # noqa: E501
        ])
        self.assertEqual(self.client.get(reverse('message-settings')).data['texts'], {})

    def test_unknown_template_and_blank_text_are_refused(self):
        self.assertEqual(self.patch({'texts': {'anniv': 'Bonjour'}}).status_code, 400)
        self.assertEqual(self.patch({'texts': {'promo': '   '}}).status_code, 400)
        self.assertEqual(self.patch({'tone': 'familier'}).status_code, 400)

    def test_settings_payload_has_both_tones_in_requested_language(self):
        data = self.client.get(reverse('message-settings'), {'lang': 'ar'}).data
        self.assertEqual(data['tone'], 'warm')
        self.assertEqual(set(data['defaults']), {'warm', 'professional'})
        self.assertEqual(list(data['defaults']['warm']), [
            'order_confirmation', 'tracking', 'unpaid_followup', 'thank_you', 'promo',
        ])
        self.assertTrue(data['defaults']['warm']['unpaid_followup'].startswith('مرحبًا'))

    def test_tracking_text_follows_fulfillment_mode(self):
        message = self.compose(order_id=str(self.order.id), template='tracking').data['message']  # noqa: E501
        self.assertIn('est prête', message)
        self.shop.fulfillment_mode = 'delivery'
        self.shop.save(update_fields=['fulfillment_mode'])
        message = self.compose(order_id=str(self.order.id), template='tracking').data['message']  # noqa: E501
        self.assertIn('remise au livreur', message)

    def test_suggested_template_follows_order_step(self):
        from .services import suggest_template

        cases = [
            ('to_prepare', 'unpaid', None, 'order_confirmation'),
            ('prepared', 'unpaid', None, 'tracking'),
            ('shipped', 'paid', None, 'thank_you'),
            ('shipped', 'partial', None, 'unpaid_followup'),
            ('prepared', 'unpaid', 'delivery', 'order_confirmation'),
            ('shipped', 'unpaid', 'delivery', 'tracking'),
            ('cancelled', 'unpaid', None, 'free'),
        ]
        for status_, payment, mode, expected in cases:
            self.order.status, self.order.payment_status = status_, payment
            self.shop.fulfillment_mode = mode
            self.assertEqual(suggest_template(self.shop, self.order), expected, (status_, payment, mode))  # noqa: E501
        data = self.compose(order_id=str(self.order.id)).data
        self.assertEqual(data['template_type'], 'order_confirmation')

    def test_customer_followup_covers_all_due_orders(self):
        from datetime import UTC, datetime

        self.make_order(self.shop, self.customer, '2025-061', paid='0.00', payment_status='unpaid',  # noqa: E501
                        created_at=datetime(2025, 5, 2, 10, 0, tzinfo=UTC))
        self.make_order(self.shop, self.customer, '2025-070', paid='44.97', payment_status='paid')  # noqa: E501
        self.set_text('unpaid_followup', '{commande}|{date}|{reste}')
        data = self.compose(customer_id=str(self.customer.id)).data
        self.assertEqual(data['template_type'], 'unpaid_followup')
        self.assertEqual(data['message'], '⁦2025-054⁩ et ⁦2025-061⁩|1 avr. 2025|79,94\xa0€')  # noqa: E501

    def test_customer_without_due_order_gets_greeting(self):
        nadia = Customer.objects.create(shop=self.shop, name='Nadia')
        data = self.compose(customer_id=str(nadia.id), lang='fr').data
        self.assertEqual(data, {'template_type': 'free', 'message': 'Bonjour Nadia 😊'})

    def test_empty_variable_takes_its_space(self):
        anonymous = Customer.objects.create(shop=self.shop, name='')
        self.assertEqual(
            self.compose(customer_id=str(anonymous.id), lang='fr').data['message'],
            'Bonjour 😊',
        )

    def test_prepared_message_uses_templates(self):
        self.set_text('order_confirmation', 'Merci {client} pour {commande}')
        response = self.client.post(reverse('prepared-message-list'), {
            'template_type': 'order_confirmation', 'context_type': 'order',
            'context_id': str(self.order.id),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['message'], 'Merci Karima pour ⁦2025-054⁩')

    # ── Aperçu ─────────────────────────────────────────────────────────

    def test_preview_renders_on_latest_order(self):
        newer = self.make_order(self.shop, self.customer, '2026-001', created_at=timezone.now())  # noqa: E501
        data = self.preview('{commande} {client} {inconnue}', tone='professional', lang='fr').data  # noqa: E501
        self.assertEqual(data['message'], f'⁦{newer.order_number}⁩ Karima Bensouda {{inconnue}}')  # noqa: E501
        self.assertFalse(data['is_sample'])
        self.assertEqual(data['unknown_variables'], ['inconnue'])

    def test_preview_uses_sample_without_orders(self):
        owner = User.objects.create_user(email='new@example.com', password='Pass123!Strong')  # noqa: E501
        self.make_shop('Neuve', owner)
        self.client.force_authenticate(user=owner)
        data = self.preview('{client} {commande} {total}', lang='fr').data
        self.assertTrue(data['is_sample'])
        self.assertEqual(data['customer_name'], 'Karima Bensouda')
        self.assertRegex(data['message'], r'^Karima ⁦\d{4}-054⁩ 44,97\xa0€$')

    # ── Droits et isolation ────────────────────────────────────────────

    def staff(self, permissions):
        user = User.objects.create_user(email=f'staff{len(permissions)}@example.com', password='Pass123!Strong')  # noqa: E501
        ShopMember.objects.create(shop=self.shop, user=user, role='staff', permissions=permissions)  # noqa: E501
        self.client.force_authenticate(user=user)

    def test_staff_cannot_edit_templates_but_composes_with_module(self):
        self.staff(['orders', 'messages'])
        self.assertEqual(self.client.get(reverse('message-settings')).status_code, 403)
        self.assertEqual(self.patch({'tone': 'professional'}).status_code, 403)
        self.assertEqual(self.preview('{client}').status_code, 403)
        self.assertEqual(self.compose(order_id=str(self.order.id)).status_code, 200)

    def test_staff_without_messages_module_cannot_compose(self):
        self.staff(['orders'])
        self.assertEqual(self.compose(order_id=str(self.order.id)).status_code, 403)

    def test_settings_require_whatsapp_plan(self):
        owner = User.objects.create_user(email='free@example.com', password='Pass123!Strong')  # noqa: E501
        shop = self.make_shop('Gratuite', owner, plan=SubscriptionPlan.CODE_FREE)
        self.client.force_authenticate(user=owner)
        self.assertEqual(self.client.get(reverse('message-settings')).status_code, 403)
        customer = Customer.objects.create(shop=shop, name='Nadia')
        self.assertEqual(self.compose(customer_id=str(customer.id)).status_code, 200)

    def test_shops_are_isolated(self):
        owner = User.objects.create_user(email='other@example.com', password='Pass123!Strong')  # noqa: E501
        other = self.make_shop('Autre', owner)
        stranger = Customer.objects.create(shop=other, first_name='Inès', name='Autre')
        foreign = self.make_order(other, stranger, '2026-999', created_at=timezone.now())  # noqa: E501

        self.assertEqual(self.compose(order_id=str(foreign.id)).status_code, 404)
        self.assertEqual(self.compose(customer_id=str(stranger.id)).status_code, 404)
        # La commande la plus récente de l'autre boutique n'apparaît pas dans l'aperçu.
        self.assertEqual(self.preview('{commande}').data['message'], '⁦2025-054⁩')

        self.patch({'tone': 'professional', 'texts': {'promo': 'Promo {client}'}})
        self.client.force_authenticate(user=owner)
        data = self.client.get(reverse('message-settings')).data
        self.assertEqual((data['tone'], data['texts']), ('warm', {}))
