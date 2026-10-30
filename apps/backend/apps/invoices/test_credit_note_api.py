"""API des avoirs (URS-112) : émission, liste, détail, refus et multi-tenant."""

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.core.testing import race_on_lock
from apps.orders.models import Order
from apps.shops.models import ShopMember
from apps.stock.models import StockMovement

from . import credit_notes, drafts, services
from .factories import InvoiceFactory
from .models import FULLY_CREDITED, Invoice
from .test_credit_notes import LINES, _issued
from .tests import _make_order_with_items, _make_shop


def _ctx(email: str) -> SimpleNamespace:
    user, shop, variant, customer = _make_shop(email)
    api = APIClient()
    api.force_authenticate(user)
    return SimpleNamespace(
        user=user, shop=shop, variant=variant, customer=customer, api=api
    )


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _ctx('credit-api@example.com')


def _url(invoice: Invoice) -> str:
    return reverse('invoice-credit-notes', args=[invoice.pk])


def _rows(invoice: Invoice, *quantities: str | None) -> list[dict[str, str]]:
    """Corps JSON : quantité par ligne, dans l'ordre ; `None` saute la ligne."""
    return [
        {'line': str(line.pk), 'quantity': qty}
        for line, qty in zip(invoice.lines.all(), quantities, strict=False)
        if qty is not None
    ]


def _post(api: APIClient, invoice: Invoice, **body):
    body.setdefault('reason', 'Retour client')
    body.setdefault('mode', 'partial' if 'lines' in body else 'total')
    return api.post(_url(invoice), body, format='json')


def _fresh(invoice: Invoice) -> Invoice:
    return Invoice.objects.get(pk=invoice.pk)


# Émission et détail


@pytest.mark.django_db
def test_total_credit_note_is_created_with_its_detail(ctx) -> None:
    invoice = _issued(ctx)
    response = _post(ctx.api, invoice, reason='  Commande annulée  ')
    assert response.status_code == 201
    data = response.data
    assert (data['kind'], data['status'], data['number'][:6]) == (
        'credit_note',
        'issued',
        'avoir-',
    )
    assert (data['total_ttc'], data['credited_invoice']) == ('92.40', invoice.pk)
    assert data['credited_number'] == invoice.number
    assert data['credited_issued_date'] == invoice.presentation['issued_date']
    assert data['credit_reason'] == 'Commande annulée'
    assert [line['quantity'] for line in data['lines']] == ['3.000', '2.000']
    assert (data['credit_notes'], data['fully_credited']) == ([], False)
    assert _fresh(invoice).credited_total == Decimal('92.40')


@pytest.mark.django_db
def test_invoice_detail_lists_its_credit_notes(ctx) -> None:
    invoice = _issued(ctx)
    first = _post(ctx.api, invoice, lines=_rows(invoice, '1')).data
    detail = reverse('invoice-detail', args=[invoice.pk])
    data = ctx.api.get(detail).data
    assert (data['credited_total'], data['fully_credited']) == (
        first['total_ttc'],
        False,
    )
    assert data['credit_notes'] == [
        {'id': first['id'], 'number': first['number'], 'total_ttc': first['total_ttc']}
    ]
    last = _post(ctx.api, invoice).data
    data = ctx.api.get(detail).data
    assert (data['credited_total'], data['fully_credited']) == ('92.40', True)
    assert [n['number'] for n in data['credit_notes']] == [
        last['number'],
        first['number'],
    ]
    row = next(
        r
        for r in ctx.api.get(reverse('invoice-list')).data['results']
        if r['id'] == str(invoice.pk)
    )
    assert (row['fully_credited'], len(row['credit_notes'])) == (True, 2)


@pytest.mark.django_db
def test_shipping_only_credit_note(ctx) -> None:
    invoice = _issued(ctx)
    response = _post(ctx.api, invoice, lines=[], include_shipping=True)
    assert response.status_code == 201
    data = response.data
    assert (data['subtotal_ht'], data['shipping_amount'], data['total_ttc']) == (
        '0.00',
        '5.00',
        '6.00',
    )
    assert data['lines'] == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    'credited,total', [('0', '0'), ('0', '50'), ('20', '50'), ('50', '50')]
)
def test_fully_credited_flag_matches_the_query(credited: str, total: str) -> None:
    invoice = InvoiceFactory(issued=True, total_ttc=Decimal(total))
    Invoice.objects.filter(pk=invoice.pk).update(credited_total=Decimal(credited))
    invoice.refresh_from_db()
    in_query = Invoice.objects.filter(FULLY_CREDITED, pk=invoice.pk).exists()
    assert invoice.is_fully_credited is in_query
    assert in_query is (credited == total != '0')


# Audit, stock et commande


@pytest.mark.django_db
def test_credit_note_is_audited_with_its_author(ctx) -> None:
    invoice = _issued(ctx)
    note = _post(ctx.api, invoice, lines=_rows(invoice, '1')).data
    log = AuditLog.objects.get(action='credit_note_issued')
    assert (log.shop_id, log.user_id, str(log.object_id), log.object_repr) == (
        ctx.shop.pk,
        ctx.user.pk,
        note['id'],
        note['number'],
    )
    assert log.changes == {
        'credited_invoice': invoice.number,
        'total_ttc': note['total_ttc'],
        'warnings': [],
    }


@pytest.mark.django_db
def test_failed_audit_rolls_the_credit_note_back(ctx) -> None:
    invoice = _issued(ctx)
    with (
        mock.patch.object(credit_notes, 'log_action', side_effect=RuntimeError),
        pytest.raises(RuntimeError),
    ):
        credit_notes.issue_credit_note(
            ctx.shop, invoice, None, 'Retour', ctx.user, acknowledged_warnings=[]
        )
    assert not Invoice.objects.filter(kind='credit_note').exists()
    assert _fresh(invoice).credited_total == 0


@pytest.mark.django_db
def test_credit_note_api_never_touches_stock_nor_the_order(ctx) -> None:
    order = _make_order_with_items(ctx.shop, ctx.user, ctx.variant, ctx.customer)
    invoice = services.issue_invoice_from_order(shop=ctx.shop, order=order)
    movements = list(StockMovement.objects.filter(shop=ctx.shop).values())
    before = Order.objects.filter(pk=order.pk).values().get()
    assert _post(ctx.api, invoice, lines=_rows(invoice, '1')).status_code == 201
    assert _post(ctx.api, invoice).status_code == 201
    assert list(StockMovement.objects.filter(shop=ctx.shop).values()) == movements
    assert Order.objects.filter(pk=order.pk).values().get() == before


# Refus


def _draft(ctx: SimpleNamespace) -> Invoice:
    return drafts.create_draft_invoice(ctx.shop, {'lines': LINES})


def _cancelled(ctx: SimpleNamespace) -> Invoice:
    invoice = _issued(ctx)
    services.cancel_invoice(invoice)
    return invoice


def _credit_note(ctx: SimpleNamespace) -> Invoice:
    invoice = _issued(ctx)
    return Invoice.objects.get(pk=_post(ctx.api, invoice).data['id'])


@pytest.mark.django_db
@pytest.mark.parametrize(
    'target,code',
    [
        (_draft, 'invoice_draft'),
        (_cancelled, 'invoice_cancelled'),
        (_credit_note, 'credit_note_of_credit_note'),
    ],
)
def test_documents_that_cannot_be_credited(ctx, target, code: str) -> None:
    document = target(ctx)
    notes = Invoice.objects.filter(kind='credit_note').count()
    response = _post(ctx.api, document)
    assert response.status_code == 409
    assert response.data['code'] == code
    assert response.data['detail']
    assert Invoice.objects.filter(kind='credit_note').count() == notes


@pytest.mark.django_db
def test_over_credit_and_nothing_to_credit_are_conflicts(ctx) -> None:
    invoice = _issued(ctx)
    assert _post(ctx.api, invoice, lines=_rows(invoice, '3')).status_code == 201
    credited = _fresh(invoice).credited_total
    over = _post(ctx.api, invoice, lines=_rows(invoice, '1'))
    nothing = _post(ctx.api, invoice, lines=[])
    assert [(r.status_code, r.data['code']) for r in (over, nothing)] == [
        (409, 'over_credit'),
        (409, 'nothing_to_credit'),
    ]
    assert _fresh(invoice).credited_total == credited


@pytest.mark.django_db
@pytest.mark.parametrize(
    'body,field',
    [
        ({'reason': '   '}, 'reason'),
        ({'reason': 'x' * 501}, 'reason'),
        ({'mode': 'half'}, 'mode'),
        ({'mode': 'total', 'lines': 'first'}, 'lines'),
        ({'lines': [{'line': 'not-a-uuid', 'quantity': '1'}]}, 'lines'),
        ({'lines': 'unknown'}, 'lines'),
        ({'lines': 'zero'}, 'lines'),
        ({'lines': 'beyond'}, 'lines'),
        ({'lines': 'twice'}, 'lines'),
    ],
)
def test_invalid_input_is_a_bad_request(ctx, body: dict, field: str) -> None:
    invoice = _issued(ctx)
    line = str(invoice.lines.first().pk)
    rows = {
        'first': [{'line': line, 'quantity': '1'}],
        'unknown': [{'line': str(ctx.customer.pk), 'quantity': '1'}],
        'zero': [{'line': line, 'quantity': '0'}],
        'beyond': [{'line': line, 'quantity': '3.5'}],
        'twice': [{'line': line, 'quantity': '1'}] * 2,
    }
    if isinstance(body.get('lines'), str):
        body = {**body, 'lines': rows[body['lines']]}
    response = _post(ctx.api, invoice, **body)
    assert response.status_code == 400
    assert field in response.data['errors']
    assert _fresh(invoice).credited_total == 0
    assert not AuditLog.objects.filter(action='credit_note_issued').exists()


# Conformité (recommandations, France seulement)


@pytest.mark.django_db
def test_missing_seller_address_must_be_acknowledged(ctx) -> None:
    invoice = _issued(ctx)
    Invoice.objects.filter(pk=invoice.pk).update(seller_address='')
    response = _post(ctx.api, invoice)
    assert (response.status_code, response.data['code']) == (409, 'compliance_warnings')
    assert [issue['code'] for issue in response.data['issues']] == ['seller_address']
    assert _fresh(invoice).credited_total == 0
    response = _post(ctx.api, invoice, acknowledged_warnings=['seller_address'])
    assert response.status_code == 201
    log = AuditLog.objects.get(action='credit_note_issued')
    assert log.changes['warnings'] == ['seller_address']


@pytest.mark.django_db
def test_no_recommendation_outside_france(ctx) -> None:
    invoice = _issued(ctx)
    Invoice.objects.filter(pk=invoice.pk).update(
        seller_country='MA', seller_address='', seller_tax_id=''
    )
    assert _post(ctx.api, invoice).status_code == 201


# Liste, multi-tenant et permissions


@pytest.mark.django_db
def test_list_returns_only_the_credit_notes_of_this_invoice(ctx) -> None:
    invoice, sibling = _issued(ctx), _issued(ctx)
    mine = _post(ctx.api, invoice, lines=_rows(invoice, '1')).data
    _post(ctx.api, sibling)
    # Avoir d'une autre boutique rattaché à tort à cette facture : jamais montré.
    other = _ctx('credit-api-rogue@example.com')
    InvoiceFactory(partial_credit=True, shop=other.shop, credited_invoice=invoice)
    response = ctx.api.get(_url(invoice))
    assert response.status_code == 200
    assert [note['id'] for note in response.data] == [mine['id']]
    detail = ctx.api.get(reverse('invoice-detail', args=[invoice.pk])).data
    assert [note['id'] for note in detail['credit_notes']] == [mine['id']]


@pytest.mark.django_db
def test_other_shop_gets_404_on_every_endpoint(ctx) -> None:
    invoice = _issued(ctx)
    other = _ctx('credit-api-other@example.com')
    responses = [other.api.get(_url(invoice)), _post(other.api, invoice)]
    assert [r.status_code for r in responses] == [404, 404]
    assert _fresh(invoice).credited_total == 0


@pytest.mark.django_db
def test_staff_without_invoices_module_is_refused(ctx) -> None:
    invoice = _issued(ctx)
    staff = User.objects.create_user(
        email='credit-api-staff@example.com', password='Pass123!Strong'
    )
    ShopMember.objects.create(
        shop=ctx.shop, user=staff, role='staff', permissions=['orders']
    )
    api = APIClient()
    api.force_authenticate(staff)
    responses = [api.get(_url(invoice)), _post(api, invoice)]
    assert [r.status_code for r in responses] == [403, 403]
    assert _fresh(invoice).credited_total == 0


# Fabriques


@pytest.mark.django_db
def test_credit_note_factory_traits() -> None:
    partial = InvoiceFactory(partial_credit=True)
    credited = partial.credited_invoice
    assert (partial.kind, partial.status, partial.number[:6]) == (
        'credit_note',
        'issued',
        'avoir-',
    )
    assert (credited.shop_id, credited.kind, credited.status) == (
        partial.shop_id,
        'invoice',
        'issued',
    )
    assert partial.presentation['credited_number'] == credited.number
    assert (credited.credited_total, credited.is_fully_credited) == (
        partial.total_ttc,
        False,
    )
    total = InvoiceFactory(total_credit=True)
    assert total.total_ttc == total.credited_invoice.total_ttc
    assert _fresh(total.credited_invoice).is_fully_credited


# Concurrence


class ConcurrentCreditNoteApiTest(TransactionTestCase):
    """Deux POST simultanés sur la même facture : le premier s'arrête, verrous
    tenus, avant de lire ce qui est déjà crédité ; le second attend."""

    serialized_rollback = True

    def test_two_requests_exceeding_the_invoice_only_one_passes(self) -> None:
        ctx = _ctx('race-credit-api@example.com')
        invoice = _issued(ctx)

        def request(*quantities: str):
            api = APIClient()
            api.force_authenticate(ctx.user)
            return lambda: _post(api, invoice, lines=_rows(invoice, *quantities))

        results = race_on_lock(
            (credit_notes, '_already_credited'),
            request('2', '2'),
            request('2', '1'),
        )
        first, second = results['save'], results['issue']
        assert first.status_code == 201, results
        assert (second.status_code, second.data['code']) == (409, 'over_credit')
        refreshed = _fresh(invoice)
        assert refreshed.credited_total == Decimal(first.data['total_ttc'])
        assert refreshed.credited_total <= refreshed.total_ttc
        assert Invoice.objects.filter(kind='credit_note').count() == 1
