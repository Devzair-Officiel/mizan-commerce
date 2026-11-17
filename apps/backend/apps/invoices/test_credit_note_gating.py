"""Gating des avoirs par formule (URS-112) : lecture libre, émission dès Solo.

En Découverte, les avoirs d'une facture restent listables (`GET …/credit-notes/`) ;
l'émission et l'aperçu répondent 403 avec le message standard, sans rien écrire.
Le détail, la liste et le PDF d'un avoir passent par les endpoints des factures,
inchangés (gating `invoices`).
"""

from types import SimpleNamespace

import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.shops.models import ShopMember
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.permissions import HasPlanForFeature
from apps.subscriptions.test_utils import attach_subscription, attach_trial

from .models import Invoice
from .test_credit_notes import _credit, _issued, _rows
from .tests import _make_shop

FREE = SubscriptionPlan.CODE_FREE
SOLO = SubscriptionPlan.CODE_SOLO
TRIAL = 'trial'
PLAN_DENIED = HasPlanForFeature.message
BODY = {'mode': 'total', 'reason': 'Retour client'}
# (méthode, route, réponse attendue dès Solo) : écritures.
WRITES = (
    ('post', 'invoice-credit-notes', 201),
    ('post', 'invoice-credit-note-preview', 200),
)


def set_plan(shop, plan: str) -> None:
    """Formule active, ou essai Boutique en cours (`TRIAL`)."""
    if plan == TRIAL:
        attach_trial(shop)
    else:
        attach_subscription(shop, plan_code=plan)


def _ctx(email: str) -> SimpleNamespace:
    """Boutique Solo : une facture émise, déjà créditée en partie."""
    user, shop, variant, customer = _make_shop(email)
    api = APIClient()
    api.force_authenticate(user)
    ctx = SimpleNamespace(
        user=user, shop=shop, variant=variant, customer=customer, api=api
    )  # noqa: E501
    ctx.invoice = _issued(ctx)
    ctx.note = _credit(ctx, ctx.invoice, _rows(ctx.invoice, '1'))
    return ctx


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _ctx('credit-gating@example.com')


def _call(api: APIClient, invoice: Invoice, method: str, name: str):
    url = reverse(name, args=[invoice.pk])
    return getattr(api, method)(url, BODY if method == 'post' else None, format='json')


def _notes(shop) -> list:
    notes = Invoice.objects.filter(shop=shop, kind=Invoice.KIND_CREDIT_NOTE)
    return list(notes.values_list('pk', 'number', 'total_ttc'))


@pytest.mark.django_db
@pytest.mark.parametrize('plan', [FREE, SOLO, TRIAL])
def test_credit_notes_of_an_invoice_are_readable_on_every_plan(ctx, plan) -> None:
    set_plan(ctx.shop, plan)
    response = _call(ctx.api, ctx.invoice, 'get', 'invoice-credit-notes')
    assert response.status_code == 200
    assert [note['id'] for note in response.data] == [str(ctx.note.pk)]


@pytest.mark.django_db
@pytest.mark.parametrize('method,name,expected', WRITES)
def test_issue_and_preview_are_refused_in_discovery(
    ctx, method, name, expected
) -> None:  # noqa: E501
    set_plan(ctx.shop, FREE)
    before = (_notes(ctx.shop), Invoice.objects.get(pk=ctx.invoice.pk).credited_total)
    response = _call(ctx.api, ctx.invoice, method, name)
    assert (response.status_code, response.data['detail']) == (403, PLAN_DENIED)
    after = (_notes(ctx.shop), Invoice.objects.get(pk=ctx.invoice.pk).credited_total)
    assert after == before


@pytest.mark.django_db
@pytest.mark.parametrize('method,name,expected', WRITES)
@pytest.mark.parametrize('plan', [SOLO, TRIAL])
def test_issue_and_preview_are_allowed_from_solo(
    ctx, plan, method, name, expected
) -> None:  # noqa: E501
    set_plan(ctx.shop, plan)
    response = _call(ctx.api, ctx.invoice, method, name)
    assert response.status_code == expected, response.data


@pytest.mark.django_db
@pytest.mark.parametrize('plan', [FREE, SOLO])
def test_suspended_staff_stays_refused(ctx, plan) -> None:
    """Sans Boutique, un employé reste suspendu, lecture comprise."""
    staff = User.objects.create_user(
        email='credit-staff@example.com', password='Pass123!Strong'
    )  # noqa: E501
    ShopMember.objects.create(shop=ctx.shop, user=staff, role=ShopMember.ROLE_STAFF)
    set_plan(ctx.shop, plan)
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(staff)}')
    for method, name, *_ in (('get', 'invoice-credit-notes'), *WRITES):
        response = _call(api, ctx.invoice, method, name)
        assert (response.status_code, response.data['code']) == (
            403,
            'staff_suspended_plan',
        ), (method, name)


@pytest.mark.django_db
@pytest.mark.parametrize('plan', [FREE, SOLO])
def test_other_shop_invoice_is_not_found(ctx, plan) -> None:
    """Avoirs d'une facture d'une autre boutique : 404 en lecture, quelle que soit
    la formule ; 404 en écriture dès Solo (en Découverte, la formule refuse d'abord)."""
    intruder = _ctx('credit-gating-other@example.com')
    set_plan(intruder.shop, plan)
    calls = [('get', 'invoice-credit-notes')]
    if plan != FREE:
        calls += [(method, name) for method, name, _ in WRITES]
    for method, name in calls:
        assert _call(intruder.api, ctx.invoice, method, name).status_code == 404, name
    assert _notes(ctx.shop) == [(ctx.note.pk, ctx.note.number, ctx.note.total_ttc)]
