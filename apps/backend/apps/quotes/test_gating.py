"""Gating des devis par formule (URS-111) : lecture libre, écriture dès Solo.

Une boutique retombée en Découverte consulte ses devis (liste, détail, PDF,
vérification d'un brouillon) mais n'en crée, ne modifie, n'envoie, ne répond
ni ne convertit plus aucun : 403 avec le message standard, rien n'est écrit.
"""

from types import SimpleNamespace

import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.invoices.models import Invoice
from apps.invoices.tests import _make_shop
from apps.shops.models import ShopMember
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.permissions import HasPlanForFeature
from apps.subscriptions.test_utils import attach_subscription, attach_trial

from .models import Quote
from .test_api import LINE

PLAN_DENIED = HasPlanForFeature.message
FREE = SubscriptionPlan.CODE_FREE
SOLO = SubscriptionPlan.CODE_SOLO
TRIAL = 'trial'

# (méthode, route, document visé) : lectures permises à toutes les formules.
READS = (
    ('get', 'quote-list', None),
    ('get', 'quote-detail', 'sent'),
    ('get', 'quote-pdf', 'sent'),
    ('get', 'quote-compliance', 'draft'),
)
# (méthode, route, document visé, réponse attendue dès Solo) : écritures.
WRITES = (
    ('post', 'quote-draft-create', None, 201),
    ('patch', 'quote-draft', 'draft', 200),
    ('delete', 'quote-draft', 'draft', 204),
    ('post', 'quote-send', 'draft', 200),
    ('post', 'quote-status', 'sent', 200),
    ('post', 'quote-convert', 'accepted', 201),
)


def set_plan(shop, plan: str) -> None:
    """Formule active, ou essai Boutique en cours (`TRIAL`)."""
    if plan == TRIAL:
        attach_trial(shop)
    else:
        attach_subscription(shop, plan_code=plan)


def _documents(email: str) -> SimpleNamespace:
    """Boutique Solo avec un brouillon, un devis envoyé et un devis accepté."""
    user, shop, _, customer = _make_shop(email)
    shop.invoice_payment_methods = ['transfer']
    shop.save(update_fields=['invoice_payment_methods'])
    api = APIClient()
    api.force_authenticate(user)
    ids = {}
    for state in ('draft', 'sent', 'accepted'):
        body = {'customer': str(customer.pk), 'lines': [LINE]}
        pk = api.post(reverse('quote-draft-create'), body, format='json').data['id']
        if state != 'draft':
            send = api.post(reverse('quote-send', args=[pk]), {}, format='json')
            assert send.status_code == 200, send.data
        if state == 'accepted':
            accept = {'status': 'accepted'}
            api.post(reverse('quote-status', args=[pk]), accept, format='json')
        ids[state] = pk
    return SimpleNamespace(user=user, shop=shop, customer=customer, api=api, ids=ids)


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _documents('quotes-gating@example.com')


def _url(ctx: SimpleNamespace, name: str, target: str | None) -> str:
    return reverse(name, args=[ctx.ids[target]]) if target else reverse(name)


def _body(ctx: SimpleNamespace, name: str) -> dict:
    if name == 'quote-draft-create':
        return {'customer': str(ctx.customer.pk), 'lines': [LINE]}
    if name == 'quote-draft':
        draft = Quote.objects.get(pk=ctx.ids['draft'])
        return {'updated_at': draft.updated_at.isoformat(), 'notes': 'Relu'}
    if name == 'quote-status':
        return {'status': 'declined'}
    return {}


def _call(api: APIClient, ctx: SimpleNamespace, method: str, name: str, target):
    url = _url(ctx, name, target)
    return getattr(api, method)(url, _body(ctx, name), format='json')


def _snapshot(shop) -> list[tuple]:
    """État des devis et des factures de la boutique : rien ne doit bouger."""
    quotes = Quote.objects.filter(shop=shop).order_by('pk')
    rows = list(quotes.values_list('pk', 'status', 'notes', 'number', 'updated_at'))
    return rows + [('invoices', Invoice.objects.filter(shop=shop).count())]


@pytest.mark.django_db
@pytest.mark.parametrize('method,name,target', READS)
@pytest.mark.parametrize('plan', [FREE, SOLO, TRIAL])
def test_reads_are_open_to_every_plan(ctx, plan, method, name, target) -> None:
    set_plan(ctx.shop, plan)
    response = _call(ctx.api, ctx, method, name, target)
    assert response.status_code == 200, response.data


@pytest.mark.django_db
@pytest.mark.parametrize('method,name,target,expected', WRITES)
def test_writes_are_refused_in_discovery(ctx, method, name, target, expected) -> None:
    set_plan(ctx.shop, FREE)
    before = _snapshot(ctx.shop)
    response = _call(ctx.api, ctx, method, name, target)
    assert (response.status_code, response.data['detail']) == (403, PLAN_DENIED)
    assert _snapshot(ctx.shop) == before


@pytest.mark.django_db
@pytest.mark.parametrize('method,name,target,expected', WRITES)
@pytest.mark.parametrize('plan', [SOLO, TRIAL])
def test_writes_are_allowed_from_solo(
    ctx, plan, method, name, target, expected
) -> None:  # noqa: E501
    set_plan(ctx.shop, plan)
    response = _call(ctx.api, ctx, method, name, target)
    assert response.status_code == expected, response.data


@pytest.mark.django_db
@pytest.mark.parametrize('plan', [FREE, SOLO])
def test_suspended_staff_stays_refused_for_reads_and_writes(ctx, plan) -> None:
    """Sans Boutique, un employé reste suspendu : la lecture libre n'y change rien."""
    staff = User.objects.create_user(
        email='quotes-staff@example.com', password='Pass123!Strong'
    )  # noqa: E501
    ShopMember.objects.create(shop=ctx.shop, user=staff, role=ShopMember.ROLE_STAFF)
    set_plan(ctx.shop, plan)
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(staff)}')
    for method, name, target, *_ in (*READS, *WRITES):
        response = _call(api, ctx, method, name, target)
        assert (response.status_code, response.data['code']) == (
            403,
            'staff_suspended_plan',
        ), name


@pytest.mark.django_db
@pytest.mark.parametrize('plan', [FREE, SOLO])
def test_other_shop_documents_are_not_found(ctx, plan) -> None:
    """Lecture d'un devis d'une autre boutique : 404, en Découverte comme en Solo ;
    écriture : 404 dès Solo (en Découverte, la formule refuse d'abord)."""
    intruder = _documents('quotes-gating-other@example.com')
    set_plan(intruder.shop, plan)
    calls = [(m, n, t) for m, n, t in READS if t]
    if plan != FREE:
        calls += [(m, n, t) for m, n, t, _ in WRITES if t]
    for method, name, target in calls:
        response = _call(intruder.api, ctx, method, name, target)
        assert response.status_code == 404, name
