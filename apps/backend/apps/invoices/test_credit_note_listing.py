"""Avoirs dans la liste, les filtres et les indicateurs des factures (URS-112)."""

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.orders.services import current_month_bounds

from .models import Invoice, InvoiceLine
from .settings import account_summary
from .tests import _make_shop


def _doc(shop, number: str, total: str, **fields) -> Invoice:
    """Document émis tel quel ; un avoir relève le `credited_total` de sa facture."""
    fields.setdefault('issued_at', timezone.now())
    document = Invoice.objects.create(
        shop=shop, number=number, currency='EUR', total_ttc=Decimal(total), **fields
    )
    credited = fields.get('credited_invoice')
    if credited is not None:
        credited.credited_total += document.total_ttc
        credited.save(update_fields=['credited_total'])
    return document


def _note(shop, invoice: Invoice, number: str, total: str, **fields) -> Invoice:
    return _doc(
        shop,
        number,
        total,
        kind=Invoice.KIND_CREDIT_NOTE,
        credited_invoice=invoice,
        customer=invoice.customer,
        **fields,
    )


def _ctx(email: str) -> SimpleNamespace:
    user, shop, _, customer = _make_shop(email)
    api = APIClient()
    api.force_authenticate(user)
    start, _ = current_month_bounds(shop)
    return SimpleNamespace(
        api=api, shop=shop, customer=customer, last_month=start - timedelta(days=1)
    )


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _ctx('credit-list@example.com')


def _summary(ctx: SimpleNamespace) -> dict:
    data = ctx.api.get(reverse('invoice-summary')).data
    return {
        card: {'count': values['count'], 'amount': Decimal(values['amount'])}
        for card, values in data.items()
    }


def _count(ctx: SimpleNamespace, **query: str) -> int:
    return ctx.api.get(reverse('invoice-list'), query).data['count']


# D9 : chiffre d'affaires du mois


@pytest.mark.django_db
def test_issued_month_counts_issued_and_paid_minus_credit_notes(ctx) -> None:
    shop, now = ctx.shop, timezone.now()
    _doc(shop, 'fact-1', '100', customer=ctx.customer)
    paid = _doc(shop, 'fact-2', '300', status='paid', amount_paid=300, paid_at=now)
    _doc(shop, 'fact-3', '400', status='cancelled', cancelled_at=now)
    _doc(shop, '', '50', status='draft', issued_at=None)
    older = _doc(shop, 'fact-0', '200', issued_at=ctx.last_month)
    _note(shop, paid, 'avoir-1', '50')
    # Avoir du mois sur une facture du mois dernier : soustrait ce mois-ci.
    _note(shop, older, 'avoir-2', '80')
    _note(shop, older, 'avoir-0', '20', issued_at=ctx.last_month)
    other = _ctx('credit-list-other@example.com')
    _note(other.shop, _doc(other.shop, 'fact-x', '900'), 'avoir-x', '900')

    data = _summary(ctx)
    # fact-1 + fact-2 − avoir-1 − avoir-2 ; ni annulée, ni brouillon.
    assert data['issued_month'] == {'count': 4, 'amount': 270}
    assert _count(ctx, period='issued_month') == 4
    assert data['paid_month'] == {'count': 1, 'amount': 300}
    assert _count(ctx, period='paid_month') == 1


@pytest.mark.django_db
def test_issued_month_is_zero_when_everything_is_credited(ctx) -> None:
    invoice = _doc(ctx.shop, 'fact-1', '120')
    _note(ctx.shop, invoice, 'avoir-1', '120')
    assert _summary(ctx)['issued_month'] == {'count': 2, 'amount': 0}


# Paiement : à encaisser net des avoirs, avoirs hors des filtres de paiement


@pytest.fixture
def ledger(ctx) -> SimpleNamespace:
    """Six factures et cinq avoirs ; une autre boutique doit 900 à part."""
    shop, now = ctx.shop, timezone.now()
    _note(shop, _doc(shop, 'fact-1', '100'), 'avoir-1', '30')
    _note(shop, _doc(shop, 'fact-2', '200', amount_paid=50), 'avoir-2', '150')
    _note(shop, _doc(shop, 'fact-3', '300', amount_paid=100), 'avoir-3', '50')
    _note(shop, _doc(shop, 'fact-4', '300'), 'avoir-4', '300')
    _doc(shop, 'fact-5', '0')
    paid = _doc(shop, 'fact-6', '400', status='paid', amount_paid=400, paid_at=now)
    _note(shop, paid, 'avoir-6', '100')
    other = _ctx('credit-ledger-other@example.com')
    _note(other.shop, _doc(other.shop, 'fact-x', '1000'), 'avoir-x', '100')
    return ctx


def _facets(ctx: SimpleNamespace, **query: str) -> dict:
    return ctx.api.get(reverse('invoice-facets'), query).data


@pytest.mark.django_db
def test_due_is_net_of_credit_notes_and_payments(ledger) -> None:
    # fact-1 : 100 − 30 ; fact-3 : 300 − 50 − 100. fact-2 et fact-4 : plus rien.
    assert _summary(ledger)['due'] == {'count': 2, 'amount': 220}
    assert _count(ledger, payment='due') == 2


@pytest.mark.django_db
def test_payment_filters_and_facets_leave_credit_notes_out(ledger) -> None:
    # Facture gratuite toujours « non payée » ; entièrement créditée : ni l'un
    # ni l'autre.
    expected = {'due': 2, 'unpaid': 2, 'partial': 1, 'paid': 1}
    assert {name: _count(ledger, payment=name) for name in expected} == expected
    assert _facets(ledger)['payment'] == {'all': 11, **expected}
    assert _facets(ledger, kind='credit_note')['payment'] == {
        'all': 5, 'due': 0, 'unpaid': 0, 'partial': 0, 'paid': 0,
    }


@pytest.mark.django_db
def test_status_facets_count_invoices_and_credit_notes(ledger) -> None:
    statuses = _facets(ledger)['status']
    assert (statuses['all'], statuses['issued'], statuses['paid']) == (11, 10, 1)
    assert _facets(ledger, kind='invoice')['status']['issued'] == 5


@pytest.mark.django_db
def test_kind_filter_and_facet(ledger) -> None:
    assert _count(ledger, kind='credit_note') == 5
    assert _count(ledger, kind='invoice') == 6
    assert _count(ledger, kind='quote') == 11  # Valeur inconnue : ignorée.
    assert _facets(ledger)['kind'] == {'all': 11, 'invoice': 6, 'credit_note': 5}
    # Chaque menu compte les autres filtres, pas le sien.
    assert _facets(ledger, kind='credit_note', payment='due')['kind'] == {
        'all': 2, 'invoice': 2, 'credit_note': 0,
    }


@pytest.mark.django_db
def test_amount_ordering_keeps_credit_notes_positive(ledger) -> None:
    rows = ledger.api.get(
        reverse('invoice-list'), {'kind': 'credit_note', 'ordering': 'total_ttc'}
    ).data['results']
    assert [Decimal(row['total_ttc']) for row in rows] == [30, 50, 100, 150, 300]


# Suggestions de lignes et récapitulatif de compte


def _line(invoice: Invoice, description: str) -> InvoiceLine:
    return InvoiceLine.objects.create(
        shop=invoice.shop, invoice=invoice, description=description,
        quantity=1, unit_price_ht='10.00', line_subtotal_ht='10.00',
    )


@pytest.mark.django_db
def test_line_suggestions_skip_credit_note_lines(ctx) -> None:
    invoice = _doc(ctx.shop, 'fact-1', '12', customer=ctx.customer)
    _line(invoice, "Nuit d'hôtel")
    _line(_note(ctx.shop, invoice, 'avoir-1', '12'), 'Nuitée remboursée')
    other = _ctx('credit-suggest-other@example.com')
    _line(_doc(other.shop, 'fact-x', '12'), 'Nuit secrète')

    rows = ctx.api.get(reverse('invoice-line-suggestions'), {'q': 'nui'}).data
    assert [row['description'] for row in rows] == ["Nuit d'hôtel"]


@pytest.mark.django_db
def test_account_summary_never_counts_a_credit_note_as_debt(ctx) -> None:
    shop, customer = ctx.shop, ctx.customer
    earlier = timezone.now() - timedelta(days=2)
    credited = _doc(shop, 'fact-1', '100', customer=customer, issued_at=earlier)
    _note(shop, credited, 'avoir-1', '40', issued_at=earlier)
    # Payée 50 puis créditée en entier : le trop-perçu ne réduit pas le solde.
    overpaid = _doc(
        shop, 'fact-2', '80', customer=customer, amount_paid=50, issued_at=earlier
    )
    _note(shop, overpaid, 'avoir-2', '80', issued_at=earlier)
    other = _ctx('credit-summary-other@example.com')
    _doc(other.shop, 'fact-x', '900', customer=other.customer, issued_at=earlier)
    current = _doc(shop, 'fact-3', '200', customer=customer)

    summary = account_summary(current)
    assert summary['previous_invoices'] == [{'number': 'fact-1', 'due': '60.00'}]
    assert Decimal(summary['previous_balance']) == 60
    assert Decimal(summary['total_balance']) == 260
