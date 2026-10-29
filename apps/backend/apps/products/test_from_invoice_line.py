"""Service du catalogue créé depuis une ligne de facture libre (URS-110)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.invoices.tests import _make_shop
from apps.shops.models import ShopMember
from apps.subscriptions.models import SubscriptionPlan

from .constants import DEFAULT_VARIANT_NAME
from .models import Product

URL = 'product-from-invoice-line'
PAYLOAD = {'name': 'Nuitée', 'unit_label': 'nuit', 'unit_price_ht': '85.50'}


@pytest.fixture
def ctx():
    user, shop, _, _ = _make_shop('from-line@example.com')
    api = APIClient()
    api.force_authenticate(user)
    return api, shop


@pytest.mark.django_db
def test_creates_a_service_with_one_default_variant(ctx) -> None:
    api, shop = ctx
    response = api.post(reverse(URL), PAYLOAD, format='json')
    assert response.status_code == 201, response.data
    product = Product.objects.get(pk=response.data['id'], shop=shop)
    assert (product.name, product.type) == ('Nuitée', 'service')
    variant = product.variants.get()
    assert variant.packaging_name == DEFAULT_VARIANT_NAME
    assert (variant.unit_label, str(variant.selling_price)) == ('nuit', '85.50')


@pytest.mark.django_db
def test_existing_name_returns_the_article_instead_of_a_duplicate(ctx) -> None:
    api, shop = ctx
    first = api.post(reverse(URL), PAYLOAD, format='json').data
    response = api.post(reverse(URL), {**PAYLOAD, 'name': 'NUITÉE'}, format='json')
    assert response.status_code == 409
    assert response.data['code'] == 'product_name_taken'
    assert response.data['existing_id'] == first['id']
    assert Product.objects.filter(shop=shop, name__iexact='nuitée').count() == 1


@pytest.mark.django_db
def test_same_name_in_another_shop_is_not_a_duplicate(ctx) -> None:
    api, shop = ctx
    mine = api.post(reverse(URL), PAYLOAD, format='json').data['id']
    other, other_shop, _, _ = _make_shop('from-line-other@example.com')
    other_api = APIClient()
    other_api.force_authenticate(other)
    response = other_api.post(reverse(URL), PAYLOAD, format='json')
    # Ni 409 ni `existing_id` : l'article d'une autre boutique reste invisible.
    assert response.status_code == 201
    assert 'existing_id' not in response.data and response.data['id'] != mine
    assert Product.objects.get(pk=response.data['id']).shop == other_shop
    assert Product.objects.get(pk=mine).shop == shop


@pytest.mark.django_db
def test_plan_product_limit_applies(ctx) -> None:
    api, shop = ctx
    SubscriptionPlan.objects.filter(pk=shop.effective_plan.pk).update(max_products=1)
    response = api.post(reverse(URL), PAYLOAD, format='json')
    assert response.status_code == 400
    assert not Product.objects.filter(shop=shop, name='Nuitée').exists()


@pytest.mark.django_db
@pytest.mark.parametrize('modules', [['invoices'], ['products']])
def test_requires_both_catalog_and_invoices_modules(ctx, modules) -> None:
    _, shop = ctx
    staff = User.objects.create_user(email=f'staff-{modules[0]}@example.com',
                                     password='Pass123!Strong')
    ShopMember.objects.create(shop=shop, user=staff, role='staff',
                              permissions=modules)
    api = APIClient()
    api.force_authenticate(staff)
    assert api.post(reverse(URL), PAYLOAD, format='json').status_code == 403


@pytest.mark.django_db
def test_invalid_line_is_rejected(ctx) -> None:
    api, _ = ctx
    for payload in ({**PAYLOAD, 'unit_price_ht': '-1'}, {**PAYLOAD, 'name': ''}):
        assert api.post(reverse(URL), payload, format='json').status_code == 400


@pytest.mark.django_db
def test_unit_label_can_be_corrected_and_survives_the_article_form(ctx) -> None:
    api, _ = ctx
    product = Product.objects.get(
        pk=api.post(reverse(URL), PAYLOAD, format='json').data['id']
    )
    variant = product.variants.get()
    url = reverse('product-variant-detail', args=[product.pk, variant.pk])
    response = api.patch(url, {'unit_label': 'nuitée'}, format='json')
    assert (response.status_code, response.data['unit_label']) == (200, 'nuitée')
    assert api.patch(url, {'unit_label': 'u' * 31}, format='json').status_code == 400
    # Le tableau des formats de la fiche article n'envoie pas l'unité facturée.
    row = {'id': str(variant.pk), 'packaging_name': variant.packaging_name,
           'selling_price': '90.00'}
    response = api.patch(
        reverse('product-detail', args=[product.pk]), {'variants': [row]},
        format='json',
    )
    assert response.status_code == 200, response.data
    assert response.data['variants'][0]['unit_label'] == 'nuitée'
    variant.refresh_from_db()
    assert (variant.unit_label, str(variant.selling_price)) == ('nuitée', '90.00')
