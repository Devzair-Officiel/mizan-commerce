"""Avoirs et règlements (D4, D10, URS-112) : annulation, paiement, commande liée."""

import logging
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.testing import race_on_lock
from apps.orders import services as order_services
from apps.orders.models import Order

from . import credit_notes, services
from .models import Invoice
from .pdf import build_invoice_pdf
from .preview import reference_invoice
from .test_credit_notes import _rows
from .test_pdf import text_pages
from .tests import _make_order_with_items, _make_shop


def _ctx(email: str) -> SimpleNamespace:
    user, shop, variant, customer = _make_shop(email)
    order = _make_order_with_items(shop, user, variant, customer, qty=2)
    invoice = services.issue_invoice_from_order(shop=shop, order=order)
    return SimpleNamespace(user=user, shop=shop, order=order, invoice=invoice)


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _ctx('credit-pay@example.com')


def _credit(ctx: SimpleNamespace, *quantities: str) -> Invoice:
    return credit_notes.issue_credit_note(
        ctx.shop,
        Invoice.objects.get(pk=ctx.invoice.pk),
        _rows(ctx.invoice, *quantities),
        'Retour',
        None,
        acknowledged_warnings=[],
    )


def _pay(ctx: SimpleNamespace, amount: Decimal | None = None) -> Order:
    order = Order.objects.get(pk=ctx.order.pk)
    paid = order.total_amount if amount is None else amount
    return order_services.update_payment(order, paid, user=ctx.user)


def _fresh(ctx: SimpleNamespace) -> Invoice:
    return Invoice.objects.get(pk=ctx.invoice.pk)


def _patch_status(ctx: SimpleNamespace, target: str):
    api = APIClient()
    api.force_authenticate(ctx.user)
    url = reverse('invoice-status', args=[ctx.invoice.pk])
    return api.patch(url, {'status': target}, format='json')


# D4 : une facture créditée ne s'annule plus


@pytest.mark.django_db
def test_credited_invoice_cannot_be_cancelled(ctx) -> None:
    _credit(ctx, '1')
    with pytest.raises(services.InvoiceCreditedError) as raised:
        services.cancel_invoice(_fresh(ctx))
    assert raised.value.code == 'invoice_credited'
    response = _patch_status(ctx, 'cancelled')
    assert response.status_code == 409
    assert response.data['code'] == 'invoice_credited'
    invoice = _fresh(ctx)
    assert (invoice.status, invoice.cancelled_at) == ('issued', None)


@pytest.mark.django_db
def test_order_cancellation_leaves_a_credited_invoice_and_logs_it(ctx, caplog) -> None:
    _credit(ctx, '1')
    before = _fresh(ctx)
    with caplog.at_level(logging.WARNING, logger='apps.invoices.order_sync'):
        order_services.transition_status(ctx.order, 'cancelled', ctx.user)
    assert Order.objects.get(pk=ctx.order.pk).status == 'cancelled'
    invoice = _fresh(ctx)
    assert (invoice.status, invoice.amount_paid, invoice.cancelled_at) == (
        before.status,
        before.amount_paid,
        None,
    )
    assert [r.getMessage() for r in caplog.records] == [
        f'Commande {ctx.order.pk} annulée : facture créditée laissée inchangée '
        f'(boutique {ctx.shop.pk}).'
    ]


@pytest.mark.django_db
def test_order_cancellation_still_cancels_an_uncredited_invoice(ctx) -> None:
    other = _ctx('credit-pay-other@example.com')
    _credit(other, '1')
    order_services.transition_status(ctx.order, 'cancelled', ctx.user)
    assert _fresh(ctx).status == 'cancelled'
    assert _fresh(other).status == 'issued'


# D10 : règlement plafonné au net dû


@pytest.mark.django_db
def test_mark_paid_records_the_net_due(ctx) -> None:
    note = _credit(ctx, '1')
    invoice = services.mark_paid(_fresh(ctx))
    assert invoice.status == 'paid'
    assert invoice.amount_paid == invoice.total_ttc - note.total_ttc


@pytest.mark.django_db
def test_mark_paid_is_refused_once_fully_credited(ctx) -> None:
    _credit(ctx, '2')
    with pytest.raises(services.InvoiceCreditedError) as raised:
        services.mark_paid(_fresh(ctx))
    assert raised.value.code == 'fully_credited'
    response = _patch_status(ctx, 'paid')
    assert response.status_code == 409
    assert response.data['code'] == 'fully_credited'
    invoice = _fresh(ctx)
    assert (invoice.status, invoice.amount_paid, invoice.paid_at) == ('issued', 0, None)


@pytest.mark.django_db
def test_order_payment_is_capped_at_the_net_due(ctx) -> None:
    note = _credit(ctx, '1')
    _pay(ctx)
    invoice = _fresh(ctx)
    assert invoice.status == 'paid'
    assert invoice.amount_paid == invoice.total_ttc - note.total_ttc
    paid_at = invoice.paid_at
    _pay(ctx)  # Resynchronisation : la date du règlement ne bouge pas.
    assert _fresh(ctx).paid_at == paid_at
    _pay(ctx, Decimal('5.00'))
    invoice = _fresh(ctx)
    assert (invoice.status, invoice.amount_paid, invoice.paid_at) == (
        'issued',
        Decimal('5.00'),
        None,
    )


@pytest.mark.django_db
def test_fully_credited_invoice_stays_issued_when_the_order_is_paid(ctx) -> None:
    _credit(ctx, '2')
    _pay(ctx)
    invoice = _fresh(ctx)
    assert (invoice.status, invoice.amount_paid, invoice.paid_at) == ('issued', 0, None)


@pytest.mark.django_db
def test_paid_invoice_fully_credited_is_back_to_issued_on_resync(ctx) -> None:
    _pay(ctx)
    assert _fresh(ctx).status == 'paid'
    _credit(ctx, '2')  # Trop-perçu (D2) : la facture payée reste créditable.
    assert _fresh(ctx).status == 'paid'
    _pay(ctx)
    invoice = _fresh(ctx)
    assert (invoice.status, invoice.amount_paid, invoice.paid_at) == ('issued', 0, None)


@pytest.mark.django_db
@pytest.mark.parametrize('paid,remaining', [('20', '9,87'), ('40', '0,00')])
def test_pdf_amount_due_is_net_of_credit_notes(paid: str, remaining: str) -> None:
    invoice = reference_invoice()  # TTC 79,87.
    invoice.credited_total = Decimal('50')
    invoice.amount_paid = Decimal(paid)
    text = text_pages(build_invoice_pdf(invoice))[0]
    assert f'RESTE À PAYER {remaining} €' in text
    assert '10,13' not in text  # 79,87 − 50 − 40 : jamais négatif.


class ConcurrentCreditNotePaymentTest(TransactionTestCase):
    """Avoir et règlement de la commande au même moment : le premier s'arrête,
    verrou de la facture tenu ; le second l'attend ; le premier ne repart qu'alors.
    """

    serialized_rollback = True

    def test_credit_note_during_an_order_payment(self) -> None:
        ctx = _ctx('race-credit-pay@example.com')
        results = race_on_lock(
            (order_services, 'log_action'), lambda: _pay(ctx), lambda: _credit(ctx, '1')
        )
        note = results['issue']
        assert isinstance(note, Invoice), results
        invoice = _fresh(ctx)
        # Payée avant l'avoir : règlement de la commande entier, non plafonné ;
        # l'avoir constate un trop-perçu.
        assert invoice.status == 'paid'
        assert invoice.amount_paid == ctx.order.total_amount
        assert invoice.credited_total == note.total_ttc

    def test_order_payment_during_a_credit_note(self) -> None:
        ctx = _ctx('race-pay-credit@example.com')
        results = race_on_lock(
            (credit_notes, '_already_credited'),
            lambda: _credit(ctx, '1'),
            lambda: _pay(ctx),
        )
        note = results['save']
        assert isinstance(note, Invoice), results
        assert isinstance(results['issue'], Order), results
        invoice = _fresh(ctx)
        # L'écriture du règlement relit la ligne après l'avoir : plafond net.
        assert invoice.status == 'paid'
        assert invoice.amount_paid == invoice.total_ttc - note.total_ttc
        assert invoice.credited_total == note.total_ttc
