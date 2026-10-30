"""Endpoints des devis (URS-111) : brouillon, conformité, envoi, statut, conversion."""

from types import SimpleNamespace

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.invoices.models import DocumentSequence, Invoice
from apps.invoices.tests import _make_shop
from apps.shops.models import Shop, ShopMember
from apps.stock.models import StockMovement

from .models import Quote

LINE = {
    'description': 'Pose de parquet',
    'details': 'Chêne massif',
    'unit': 'm²',
    'quantity': '25',
    'unit_price_ht': '42.50',
}


def _client(user: User) -> APIClient:
    api = APIClient()
    api.force_authenticate(user)
    return api


@pytest.fixture
def ctx() -> SimpleNamespace:
    user, shop, _, customer = _make_shop('quotes-api@example.com')
    shop.invoice_payment_methods = ['transfer']
    shop.save(update_fields=['invoice_payment_methods'])
    return SimpleNamespace(user=user, shop=shop, customer=customer, api=_client(user))


def _create(ctx: SimpleNamespace, **payload) -> dict:
    payload.setdefault('customer', str(ctx.customer.pk))
    payload.setdefault('lines', [LINE])
    response = ctx.api.post(reverse('quote-draft-create'), payload, format='json')
    assert response.status_code == 201, response.data
    return response.data


def _send(ctx: SimpleNamespace, pk: str, acknowledged: list[str] | None = None):
    payload = {'acknowledged_warnings': acknowledged or []}
    return ctx.api.post(reverse('quote-send', args=[pk]), payload, format='json')


def _status(ctx: SimpleNamespace, pk: str, **payload):
    return ctx.api.post(reverse('quote-status', args=[pk]), payload, format='json')


def _actions(shop: Shop) -> list[str]:
    logs = AuditLog.objects.filter(shop_id=shop.pk, model_name='Quote')
    return list(logs.order_by('created_at').values_list('action', flat=True))


# Brouillon


@pytest.mark.django_db
def test_draft_is_created_saved_and_deleted(ctx) -> None:
    draft = _create(ctx, validity_days=45)
    assert (draft['status'], draft['number'], draft['validity_days']) == (
        'draft',
        '',
        45,
    )
    assert draft['total_ttc'] == '1275.00'
    url = reverse('quote-draft', args=[draft['id']])
    saved = ctx.api.patch(
        url,
        {'updated_at': draft['updated_at'], 'lines': [{**LINE, 'quantity': '10'}]},
        format='json',
    )
    assert saved.status_code == 200
    assert saved.data['subtotal_ht'] == '425.00'
    assert ctx.api.delete(url).status_code == 204
    assert not Quote.objects.filter(pk=draft['id']).exists()


@pytest.mark.django_db
def test_stale_patch_returns_409_and_updated_at_is_required(ctx) -> None:
    draft = _create(ctx)
    url = reverse('quote-draft', args=[draft['id']])
    stamp = {'updated_at': draft['updated_at']}
    assert ctx.api.patch(url, {**stamp, 'notes': 'a'}, format='json').status_code == 200
    stale = ctx.api.patch(url, {**stamp, 'notes': 'b'}, format='json')
    assert (stale.status_code, stale.data['code']) == (409, 'draft_conflict')
    assert ctx.api.patch(url, {'notes': 'c'}, format='json').status_code == 400
    assert Quote.objects.get(pk=draft['id']).notes == 'a'


@pytest.mark.django_db
def test_invalid_validity_is_rejected(ctx) -> None:
    for days in (0, 366):
        response = ctx.api.post(
            reverse('quote-draft-create'), {'validity_days': days}, format='json'
        )
        assert response.status_code == 400


@pytest.mark.django_db
def test_sent_quote_is_neither_patched_deleted_nor_checked(ctx) -> None:
    draft = _create(ctx)
    sent = _send(ctx, draft['id']).data
    url = reverse('quote-draft', args=[draft['id']])
    responses = [
        ctx.api.patch(url, {'updated_at': sent['updated_at']}, format='json'),
        ctx.api.delete(url),
        ctx.api.get(reverse('quote-compliance', args=[draft['id']])),
        _send(ctx, draft['id']),
    ]
    assert [(r.status_code, r.data['code']) for r in responses] == [
        (409, 'not_draft')
    ] * 4


# Conformité et envoi


@pytest.mark.django_db
def test_compliance_lists_blocking_then_recommended_points(ctx) -> None:
    Shop.objects.filter(pk=ctx.shop.pk).update(
        legal_address='', vat_number='', invoice_payment_methods=[]
    )
    draft = _create(ctx, customer=None, lines=[])
    response = ctx.api.get(reverse('quote-compliance', args=[draft['id']]))
    assert response.status_code == 200
    assert [(i['code'], i['level']) for i in response.data['issues']] == [
        ('no_lines', 'blocking'),
        ('no_customer', 'blocking'),
        ('seller_identity', 'blocking'),
        ('vat_number', 'recommended'),
        ('payment_methods', 'recommended'),
    ]


@pytest.mark.django_db
def test_recommendations_are_for_french_shops_only(ctx) -> None:
    Shop.objects.filter(pk=ctx.shop.pk).update(country='MA', invoice_payment_methods=[])
    draft = _create(ctx)
    response = ctx.api.get(reverse('quote-compliance', args=[draft['id']]))
    assert response.data['issues'] == []


@pytest.mark.django_db
def test_send_is_blocked_until_compliance_is_settled(ctx) -> None:
    blocked = _create(ctx, lines=[])
    response = _send(ctx, blocked['id'])
    assert (response.status_code, response.data['code']) == (400, 'compliance_blocking')
    assert [i['code'] for i in response.data['issues']] == ['no_lines']

    Shop.objects.filter(pk=ctx.shop.pk).update(invoice_payment_methods=[])
    draft = _create(ctx)
    response = _send(ctx, draft['id'])
    assert (response.status_code, response.data['code']) == (409, 'compliance_warnings')
    # Aucun numéro consommé, aucun journal tant que l'envoi est refusé.
    assert not DocumentSequence.objects.filter(shop=ctx.shop, kind='quote').exists()
    assert _actions(ctx.shop) == []

    response = _send(ctx, draft['id'], ['payment_methods'])
    assert response.status_code == 200
    assert response.data['status'] == 'sent'
    log = AuditLog.objects.get(shop_id=ctx.shop.pk, action='quote_sent')
    assert (log.user, log.object_repr) == (ctx.user, response.data['number'])
    assert log.changes == {'total_ttc': '1275.00', 'warnings': ['payment_methods']}


# Statut et conversion


@pytest.mark.django_db
def test_status_endpoint_allows_only_accept_and_decline(ctx) -> None:
    draft = _create(ctx)
    for target in ('sent', 'expired', 'invoiced', 'draft'):
        assert _status(ctx, draft['id'], status=target).status_code == 400
    # Depuis un brouillon : ni accord ni refus.
    response = _status(ctx, draft['id'], status='accepted')
    assert (response.status_code, response.data['code']) == (409, 'invalid_status')

    _send(ctx, draft['id'])
    accepted = _status(ctx, draft['id'], status='accepted', accepted_name='J. Dupont')
    assert (accepted.status_code, accepted.data['status']) == (200, 'accepted')
    assert accepted.data['accepted_name'] == 'J. Dupont'
    # Répété : sans effet ni second journal. Refuser ensuite : 409.
    assert _status(ctx, draft['id'], status='accepted').status_code == 200
    assert _status(ctx, draft['id'], status='declined').status_code == 409
    assert _actions(ctx.shop) == ['quote_sent', 'quote_accepted']


@pytest.mark.django_db
def test_decline_is_logged_and_final(ctx) -> None:
    draft = _create(ctx)
    _send(ctx, draft['id'])
    declined = _status(ctx, draft['id'], status='declined')
    assert (declined.status_code, declined.data['status']) == (200, 'declined')
    assert declined.data['declined_at'] is not None
    assert _status(ctx, draft['id'], status='accepted').status_code == 409
    convert = ctx.api.post(reverse('quote-convert', args=[draft['id']]))
    assert convert.status_code == 409
    assert _actions(ctx.shop) == ['quote_sent', 'quote_declined']
    log = AuditLog.objects.get(shop_id=ctx.shop.pk, action='quote_declined')
    assert log.user == ctx.user


@pytest.mark.django_db
def test_convert_creates_one_invoice_draft_and_is_logged(ctx) -> None:
    draft = _create(ctx)
    url = reverse('quote-convert', args=[draft['id']])
    assert ctx.api.post(url).status_code == 409
    _send(ctx, draft['id'])
    assert ctx.api.post(url).status_code == 409
    _status(ctx, draft['id'], status='accepted')

    response = ctx.api.post(url)
    assert response.status_code == 201
    assert (response.data['status'], response.data['number']) == ('draft', '')
    assert response.data['total_ttc'] == '1275.00'
    assert ctx.api.post(url).status_code == 409
    assert Invoice.objects.filter(shop=ctx.shop).count() == 1
    quote = ctx.api.get(reverse('quote-detail', args=[draft['id']])).data
    assert (quote['status'], str(quote['invoice'])) == (
        'invoiced',
        str(response.data['id']),
    )
    log = AuditLog.objects.get(shop_id=ctx.shop.pk, action='quote_converted')
    assert log.changes == {'invoice_id': str(response.data['id'])}


@pytest.mark.django_db
def test_full_flow_never_writes_stock(ctx) -> None:
    before = StockMovement.objects.count()
    draft = _create(ctx)
    _send(ctx, draft['id'])
    _status(ctx, draft['id'], status='accepted')
    ctx.api.post(reverse('quote-convert', args=[draft['id']]))
    assert StockMovement.objects.count() == before


# Boutique et permissions


def _every_endpoint(api: APIClient, quote: dict) -> list:
    pk = quote['id']
    return [
        api.get(reverse('quote-detail', args=[pk])),
        api.patch(
            reverse('quote-draft', args=[pk]),
            {'updated_at': quote['updated_at'], 'notes': 'x'},
            format='json',
        ),
        api.delete(reverse('quote-draft', args=[pk])),
        api.get(reverse('quote-compliance', args=[pk])),
        api.post(reverse('quote-send', args=[pk]), {}, format='json'),
        api.post(reverse('quote-status', args=[pk]), {'status': 'accepted'}),
        api.post(reverse('quote-convert', args=[pk])),
    ]


@pytest.mark.django_db
def test_every_endpoint_is_scoped_to_the_shop(ctx) -> None:
    quote = _create(ctx)
    intruder, _, _, _ = _make_shop('quotes-intruder@example.com')
    api = _client(intruder)
    assert [r.status_code for r in _every_endpoint(api, quote)] == [404] * 7
    assert api.get(reverse('quote-list')).data['count'] == 0
    assert ctx.api.get(reverse('quote-list')).data['count'] == 1
    stored = Quote.objects.get(pk=quote['id'])
    assert (stored.status, stored.notes) == ('draft', '')


@pytest.mark.django_db
def test_customer_of_another_shop_is_refused(ctx) -> None:
    _, _, _, foreign = _make_shop('quotes-foreign@example.com')
    response = ctx.api.post(
        reverse('quote-draft-create'), {'customer': str(foreign.pk)}, format='json'
    )
    assert response.status_code == 400
    assert 'customer' in response.data['errors']
    draft = _create(ctx)
    response = ctx.api.patch(
        reverse('quote-draft', args=[draft['id']]),
        {'updated_at': draft['updated_at'], 'customer': str(foreign.pk)},
        format='json',
    )
    assert response.status_code == 400
    assert Quote.objects.get(pk=draft['id']).customer == ctx.customer


@pytest.mark.django_db
def test_staff_without_invoices_module_is_refused(ctx) -> None:
    quote = _create(ctx)
    staff = User.objects.create_user(
        email='quotes-staff@example.com', password='Pass123!Strong'
    )
    member = ShopMember.objects.create(
        shop=ctx.shop, user=staff, role='staff', permissions=['orders']
    )
    api = _client(staff)
    responses = [
        api.get(reverse('quote-list')),
        api.post(reverse('quote-draft-create'), {}, format='json'),
        *_every_endpoint(api, quote),
    ]
    assert [r.status_code for r in responses] == [403] * 9
    member.permissions = ['invoices']
    member.save(update_fields=['permissions'])
    assert api.get(reverse('quote-list')).status_code == 200
