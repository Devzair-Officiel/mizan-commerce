"""Page publique : une seule section, un seul article, un seul bouton par type.

Une valeur déjà présente sur la page renvoie 400 avec un message clair,
jamais l'`IntegrityError` de la contrainte d'unicité (500).
"""

from __future__ import annotations

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.products.factories import ProductFactory
from apps.shops.models import Shop, ShopMember
from apps.subscriptions.models import Subscription, SubscriptionPlan

from .models import ContactButton, PublicCatalogVisibility, PublicPage, PublicPageSection  # noqa: E501
from .services import create_public_page


def _owner_with_page(email: str, slug: str) -> tuple[APIClient, Shop, PublicPage]:
    user = User.objects.create_user(email=email, password='StrongPass123!', full_name='Owner')  # noqa: E501
    shop = Shop.objects.create(name=f'Shop {slug}', currency='EUR')
    ShopMember.objects.create(user=user, shop=shop, role='owner')
    Subscription.objects.update_or_create(
        shop=shop,
        defaults={
            'plan': SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_BOUTIQUE_PLUS),  # noqa: E501
            'status': Subscription.STATUS_ACTIVE,
            'current_period_start': timezone.now(),
        },
    )
    page = create_public_page(shop=shop, slug=slug)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, shop, page


class SectionUniquenessTest(TestCase):
    def setUp(self) -> None:
        self.client, self.shop, self.page = _owner_with_page('a@example.com', 'boutique-a')  # noqa: E501
        self.url = reverse('public-page-sections')

    def test_duplicate_section_is_refused(self) -> None:
        response = self.client.post(self.url, {'type': 'description', 'position': 9}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['type'], ['Cette section existe déjà sur la page.'])  # noqa: E501
        self.assertEqual(self.page.sections.filter(type='description').count(), 1)

    def test_missing_section_can_be_added_again(self) -> None:
        self.page.sections.filter(type='description').delete()
        response = self.client.post(self.url, {'type': 'description', 'position': 1}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_patch_to_existing_type_is_refused(self) -> None:
        section = self.page.sections.get(type='services')
        url = reverse('public-page-section-detail', args=[section.pk])
        response = self.client.patch(url, {'type': 'products'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('type', response.data['errors'])
        # Renvoyer son propre type reste possible.
        response = self.client.patch(url, {'type': 'services', 'title': 'Prestations'}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_other_shop_page_does_not_count(self) -> None:
        client_b, _, page_b = _owner_with_page('b@example.com', 'boutique-b')
        page_b.sections.filter(type='description').delete()
        response = client_b.post(self.url, {'type': 'description', 'position': 1}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PublicPageSection.objects.get(pk=response.data['id']).page, page_b)  # noqa: E501

    def test_other_shop_section_is_not_found(self) -> None:
        client_b, _, _ = _owner_with_page('b@example.com', 'boutique-b')
        section = self.page.sections.get(type='description')
        url = reverse('public-page-section-detail', args=[section.pk])
        self.assertEqual(client_b.get(url).status_code, status.HTTP_404_NOT_FOUND)
        response = client_b.patch(url, {'type': 'contact'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CatalogUniquenessTest(TestCase):
    def setUp(self) -> None:
        self.client, self.shop, self.page = _owner_with_page('a@example.com', 'boutique-a')  # noqa: E501
        self.product = ProductFactory(shop=self.shop)
        self.url = reverse('public-page-catalog')

    def test_duplicate_product_is_refused(self) -> None:
        payload = {'product': str(self.product.pk), 'position': 0}
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, status.HTTP_201_CREATED)  # noqa: E501
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['product'], ['Cet article est déjà sur la page.'])  # noqa: E501
        self.assertEqual(PublicCatalogVisibility.objects.filter(page=self.page).count(), 1)  # noqa: E501

    def test_other_shop_product_is_refused(self) -> None:
        _, shop_b, _ = _owner_with_page('b@example.com', 'boutique-b')
        foreign = ProductFactory(shop=shop_b)
        response = self.client.post(self.url, {'product': str(foreign.pk)}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PublicCatalogVisibility.objects.exists())


class ContactUniquenessTest(TestCase):
    def setUp(self) -> None:
        self.client, self.shop, self.page = _owner_with_page('a@example.com', 'boutique-a')  # noqa: E501
        self.url = reverse('public-page-contacts')

    def test_duplicate_contact_type_is_refused(self) -> None:
        payload = {'type': 'whatsapp', 'value': '+33612345678'}
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, status.HTTP_201_CREATED)  # noqa: E501
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['errors']['type'], ['Ce bouton de contact existe déjà sur la page.'])  # noqa: E501
        self.assertEqual(ContactButton.objects.filter(page=self.page).count(), 1)

    def test_other_shop_can_use_the_same_type(self) -> None:
        payload = {'type': 'whatsapp', 'value': '+33612345678'}
        self.client.post(self.url, payload, format='json')
        client_b, _, page_b = _owner_with_page('b@example.com', 'boutique-b')
        response = client_b.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ContactButton.objects.get(pk=response.data['id']).page, page_b)
