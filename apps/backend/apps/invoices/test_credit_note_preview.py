"""Avoirs (URS-112) : aperçu, même calcul que l'émission, sans aucune écriture."""

from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.shops.models import ShopMember

from .models import DocumentSequence, Invoice
from .test_credit_note_api import (
    _cancelled,
    _credit_note,
    _ctx,
    _draft,
    _fresh,
    _post,
    _rows,
)
from .test_credit_notes import TOTALS, _issued


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _ctx('credit-preview@example.com')


def _preview(api: APIClient, invoice: Invoice, **body):
    body.setdefault('mode', 'partial' if 'lines' in body else 'total')
    url = reverse('invoice-credit-note-preview', args=[invoice.pk])
    return api.post(url, body, format='json')


def _state(invoice: Invoice) -> tuple:
    """Ce qu'une écriture changerait : avoirs, numéro, crédit, journal."""
    sequence = DocumentSequence.objects.filter(
        shop_id=invoice.shop_id, kind=DocumentSequence.KIND_CREDIT_NOTE
    ).first()
    return (
        Invoice.objects.filter(kind=Invoice.KIND_CREDIT_NOTE).count(),
        sequence.last_number if sequence else 0,
        _fresh(invoice).credited_total,
        AuditLog.objects.filter(action='credit_note_issued').count(),
    )


def _step(ctx: SimpleNamespace, invoice: Invoice, body: dict) -> dict:
    """Aperçu puis émission des mêmes entrées : l'aperçu n'écrit rien et
    annonce exactement les totaux de l'avoir créé."""
    before = _state(invoice)
    preview = _preview(ctx.api, invoice, **body)
    assert preview.status_code == 200, preview.data
    assert _state(invoice) == before
    created = _post(ctx.api, invoice, **body)
    assert created.status_code == 201, created.data
    assert preview.data['totals'] == {f: created.data[f] for f in TOTALS}
    assert preview.data['refusals'] == []
    return preview.data['totals']


# Même calcul que l'émission


@pytest.mark.django_db
def test_preview_with_discount_equals_the_created_credit_note(ctx) -> None:
    invoice = _issued(ctx)
    totals = _step(ctx, invoice, {'lines': _rows(invoice, '1', None)})
    assert (totals['discount_amount'], totals['total_ttc']) == ('1.00', '10.80')


@pytest.mark.django_db
def test_three_partial_previews_then_shipping_only(ctx) -> None:
    invoice = _issued(ctx)
    for quantities in (('1', None), ('1', '1'), ('1', '1')):
        _step(ctx, invoice, {'lines': _rows(invoice, *quantities)})
    totals = _step(ctx, invoice, {'lines': [], 'include_shipping': True})
    assert (totals['subtotal_ht'], totals['shipping_amount']) == ('0.00', '5.00')
    assert _fresh(invoice).credited_total == invoice.total_ttc


@pytest.mark.django_db
def test_preview_of_the_exact_balance(ctx) -> None:
    invoice = _issued(ctx)
    _step(ctx, invoice, {'lines': _rows(invoice, '2', '1')})
    _step(ctx, invoice, {})
    assert _fresh(invoice).credited_total == invoice.total_ttc


@pytest.mark.django_db
def test_preview_of_shipping_only(ctx) -> None:
    invoice = _issued(ctx)
    totals = _step(ctx, invoice, {'lines': [], 'include_shipping': True})
    assert (totals['tax_amount'], totals['total_ttc']) == ('1.00', '6.00')


@pytest.mark.django_db
def test_preview_takes_no_lock_and_writes_nothing(ctx) -> None:
    invoice = _issued(ctx)
    with CaptureQueriesContext(connection) as queries:
        response = _preview(ctx.api, invoice, lines=_rows(invoice, '1', '1'))
    assert response.status_code == 200
    sql = [query['sql'].upper() for query in queries.captured_queries]
    assert not [q for q in sql if 'FOR UPDATE' in q or 'FOR NO KEY UPDATE' in q]
    assert not [q for q in sql if q.startswith(('INSERT', 'UPDATE', 'DELETE'))]


# Refus prévisibles et recommandations


@pytest.mark.django_db
def test_over_credit_and_nothing_to_credit_are_foreseen(ctx) -> None:
    invoice = _issued(ctx)
    _post(ctx.api, invoice, lines=_rows(invoice, '3'))
    over = _preview(ctx.api, invoice, lines=_rows(invoice, '1'))
    nothing = _preview(ctx.api, invoice, lines=[])
    assert [
        (r.status_code, r.data['refusals'], r.data['totals']) for r in (over, nothing)
    ] == [
        (200, ['over_credit'], None),
        (200, ['nothing_to_credit'], None),
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    'target,code',
    [
        (_draft, 'invoice_draft'),
        (_cancelled, 'invoice_cancelled'),
        (_credit_note, 'credit_note_of_credit_note'),
    ],
)
def test_documents_that_cannot_be_credited_are_foreseen(ctx, target, code) -> None:
    document = target(ctx)
    response = _preview(ctx.api, document)
    assert response.status_code == 200
    assert (response.data['refusals'], response.data['totals']) == ([code], None)


@pytest.mark.django_db
def test_fully_credited_invoice_has_nothing_left(ctx) -> None:
    invoice = _issued(ctx)
    _post(ctx.api, invoice)
    assert _preview(ctx.api, invoice).data['refusals'] == ['nothing_to_credit']


@pytest.mark.django_db
def test_recommendations_are_listed_with_the_totals(ctx) -> None:
    invoice = _issued(ctx)
    Invoice.objects.filter(pk=invoice.pk).update(seller_address='')
    response = _preview(ctx.api, invoice)
    assert response.status_code == 200
    assert [issue['code'] for issue in response.data['issues']] == ['seller_address']
    assert response.data['issues'][0]['level'] == 'recommended'
    assert response.data['totals']['total_ttc'] == str(invoice.total_ttc)


@pytest.mark.django_db
def test_no_recommendation_when_the_invoice_is_complete(ctx) -> None:
    invoice = _issued(ctx)
    assert _preview(ctx.api, invoice).data['issues'] == []


# Saisie


@pytest.mark.django_db
def test_reason_is_optional_for_the_preview(ctx) -> None:
    invoice = _issued(ctx)
    for body in ({}, {'reason': ''}, {'reason': 'Retour'}):
        assert _preview(ctx.api, invoice, **body).status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize(
    'body,field',
    [
        ({'reason': 'x' * 501}, 'reason'),
        ({'mode': 'half'}, 'mode'),
        ({'lines': [{'line': 'not-a-uuid', 'quantity': '1'}]}, 'lines'),
        ({'lines': 'beyond'}, 'lines'),
    ],
)
def test_invalid_input_is_a_bad_request(ctx, body: dict, field: str) -> None:
    invoice = _issued(ctx)
    if body.get('lines') == 'beyond':
        body = {'lines': [{'line': str(invoice.lines.first().pk), 'quantity': '4'}]}
    response = _preview(ctx.api, invoice, **body)
    assert response.status_code == 400
    assert field in response.data['errors']


# Multi-tenant et permissions


@pytest.mark.django_db
def test_other_shop_gets_404(ctx) -> None:
    invoice = _issued(ctx)
    other = _ctx('credit-preview-other@example.com')
    assert _preview(other.api, invoice).status_code == 404


@pytest.mark.django_db
def test_staff_without_invoices_module_is_refused(ctx) -> None:
    invoice = _issued(ctx)
    staff = User.objects.create_user(
        email='credit-preview-staff@example.com', password='Pass123!Strong'
    )
    ShopMember.objects.create(
        shop=ctx.shop, user=staff, role='staff', permissions=['orders']
    )
    api = APIClient()
    api.force_authenticate(staff)
    assert _preview(api, invoice).status_code == 403
