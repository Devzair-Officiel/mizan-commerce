"""Avoirs dans la liste, les filtres et les indicateurs des factures (URS-112)."""

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.orders.services import current_month_bounds

from .models import Invoice
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
