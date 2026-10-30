"""Devis (URS-111) : brouillon, envoi, transitions, conversion, expiration."""

import threading
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.invoices import drafts
from apps.invoices.models import DocumentSequence, Invoice
from apps.invoices.tests import _make_shop
from apps.shops.models import Shop
from apps.stock.models import StockMovement

from . import services
from .models import Quote, QuoteLine

LINE = {
    'description': 'Pose de parquet',
    'details': 'Chêne massif, 25 m²',
    'unit': 'm²',
    'quantity': Decimal('25'),
    'unit_price_ht': Decimal('42.50'),
}


@pytest.fixture
def ctx() -> SimpleNamespace:
    user, shop, variant, customer = _make_shop('quotes@example.com')
    return SimpleNamespace(user=user, shop=shop, variant=variant, customer=customer)


def _draft(ctx: SimpleNamespace, **data) -> Quote:
    data.setdefault('customer', ctx.customer.pk)
    data.setdefault('lines', [LINE])
    return services.create_draft_quote(ctx.shop, data)


def _accepted(ctx: SimpleNamespace, **data) -> Quote:
    return services.mark_accepted_manually(services.send_quote(_draft(ctx, **data)))


def _quote_counter(shop: Shop) -> int:
    return DocumentSequence.objects.get(shop=shop, kind='quote').last_number


# Brouillon


@pytest.mark.django_db
def test_draft_has_no_number_and_takes_shop_defaults(ctx) -> None:
    quote = _draft(ctx, discount_amount=Decimal('62.50'))
    assert (quote.status, quote.number, quote.sent_at, quote.valid_until) == (
        'draft',
        '',
        None,
        None,
    )
    assert quote.validity_days == 30
    assert quote.payment_terms_days == 30
    assert quote.currency == 'EUR'
    # 25 × 42,50 = 1 062,50 ; − 62,50 = 1 000 HT ; TVA 20 % = 200.
    assert (quote.subtotal_ht, quote.tax_amount, quote.total_ttc) == (
        Decimal('1062.50'),
        Decimal('200.00'),
        Decimal('1200.00'),
    )
    assert not DocumentSequence.objects.filter(shop=ctx.shop, kind='quote').exists()


@pytest.mark.django_db
def test_update_replaces_lines_and_recomputes(ctx) -> None:
    quote = _draft(ctx)
    second = {**LINE, 'description': 'Plinthes', 'quantity': Decimal('3')}
    quote = services.update_draft_quote(
        quote, {'lines': [second, LINE], 'validity_days': 15}, quote.updated_at
    )
    assert list(quote.lines.values_list('description', 'position')) == [
        ('Plinthes', 0),
        ('Pose de parquet', 1),
    ]
    assert quote.subtotal_ht == Decimal('1190.00')
    assert quote.validity_days == 15


@pytest.mark.django_db
def test_stale_update_is_refused_and_keeps_saved_version(ctx) -> None:
    quote = _draft(ctx)
    stale = quote.updated_at
    services.update_draft_quote(quote, {'notes': 'Premier onglet'}, stale)
    with pytest.raises(drafts.DraftConflictError):
        services.update_draft_quote(quote, {'notes': 'Second onglet'}, stale)
    assert Quote.objects.get(pk=quote.pk).notes == 'Premier onglet'


@pytest.mark.django_db
def test_delete_draft_removes_its_lines(ctx) -> None:
    quote = _draft(ctx)
    services.delete_draft_quote(quote)
    assert not Quote.objects.filter(pk=quote.pk).exists()
    assert not QuoteLine.objects.filter(quote_id=quote.pk).exists()


# Envoi : numéro, instantanés et validité figés


@pytest.mark.django_db
def test_send_numbers_quotes_in_their_own_continuous_series(ctx) -> None:
    first = services.send_quote(_draft(ctx))
    second = services.send_quote(_draft(ctx))
    invoice = drafts.issue_invoice(
        drafts.create_draft_invoice(
            ctx.shop, {'customer': ctx.customer.pk, 'lines': [LINE]}
        ),
        ctx.user,
        acknowledged_warnings=[],
    )
    day = timezone.localdate(first.sent_at, ZoneInfo(ctx.shop.timezone))
    assert first.number == f'devis-{day:%d%m%y}-0001'
    assert second.number == f'devis-{day:%d%m%y}-0002'
    assert invoice.number.startswith('fact-') and invoice.number.endswith('-0001')


@pytest.mark.django_db
def test_snapshots_and_validity_are_frozen_at_send_not_at_creation(ctx) -> None:
    quote = _draft(ctx, validity_days=15)
    ctx.customer.name = 'Martin'
    ctx.customer.save()
    Shop.objects.filter(pk=ctx.shop.pk).update(legal_address='5 rue Neuve')

    quote = services.send_quote(quote)
    sent_on = timezone.localdate(quote.sent_at, ZoneInfo(ctx.shop.timezone))
    assert quote.status == 'sent'
    assert quote.buyer_name == 'Jean Martin'
    assert quote.seller_address == '5 rue Neuve'
    assert quote.valid_until == sent_on + timedelta(days=15)
    assert quote.presentation['valid_until'] == quote.valid_until.isoformat()
    assert quote.presentation['vat_number'] == 'FR123456789'

    ctx.customer.name = 'Bernard'
    ctx.customer.save()
    quote.refresh_from_db()
    assert quote.buyer_name == 'Jean Martin'


@pytest.mark.django_db
def test_sent_quote_is_immutable(ctx) -> None:
    """Hypothèse du lot : envoyé, le devis est figé ; une révision est une copie."""
    quote = services.send_quote(_draft(ctx))
    with pytest.raises(services.QuoteStateError):
        services.update_draft_quote(quote, {'notes': 'Retouche'}, quote.updated_at)
    with pytest.raises(services.QuoteStateError):
        services.delete_draft_quote(quote)
    with pytest.raises(services.QuoteStateError):
        services.send_quote(quote)
    assert _quote_counter(ctx.shop) == 1
    assert Quote.objects.get(pk=quote.pk).notes == ''


# Transitions


@pytest.mark.django_db
def test_accept_and_decline_only_from_sent(ctx) -> None:
    draft = _draft(ctx)
    with pytest.raises(services.QuoteStateError):
        services.mark_accepted_manually(draft)
    with pytest.raises(services.QuoteStateError):
        services.mark_declined(draft)

    accepted = services.mark_accepted_manually(
        services.send_quote(draft), '  Jean Dupont  '
    )
    assert (accepted.status, accepted.accepted_name) == ('accepted', 'Jean Dupont')
    assert accepted.accepted_at is not None
    # Idempotent dans le statut visé ; refusé depuis un autre statut.
    assert services.mark_accepted_manually(accepted).accepted_name == 'Jean Dupont'
    with pytest.raises(services.QuoteStateError):
        services.mark_declined(accepted)

    declined = services.mark_declined(services.send_quote(_draft(ctx)))
    assert declined.status == 'declined' and declined.declined_at is not None
    with pytest.raises(services.QuoteStateError):
        services.mark_accepted_manually(declined)


# Conversion en facture brouillon


@pytest.mark.django_db
def test_convert_creates_a_linked_invoice_draft(ctx) -> None:
    quote = _accepted(
        ctx, discount_amount=Decimal('62.50'), shipping_amount=Decimal('15.00')
    )
    invoice = services.convert_quote_to_invoice(quote)
    quote.refresh_from_db()

    assert (quote.status, quote.invoice_id) == ('invoiced', invoice.pk)
    assert invoice.quote == quote
    assert (invoice.status, invoice.number) == ('draft', '')
    assert invoice.customer == ctx.customer
    assert invoice.payment_terms_days == quote.payment_terms_days
    assert (invoice.discount_amount, invoice.shipping_amount) == (
        Decimal('62.50'),
        Decimal('15.00'),
    )
    assert invoice.total_ttc == quote.total_ttc
    assert list(invoice.lines.values_list('description', 'quantity', 'unit')) == [
        ('Pose de parquet', Decimal('25.000'), 'm²')
    ]


@pytest.mark.django_db
def test_convert_twice_or_from_another_status_leaves_no_draft(ctx) -> None:
    quote = _accepted(ctx)
    services.convert_quote_to_invoice(quote)
    sent = services.send_quote(_draft(ctx))
    for target in (quote, sent, _draft(ctx)):
        with pytest.raises(services.QuoteStateError):
            services.convert_quote_to_invoice(target)
    assert Invoice.objects.filter(shop=ctx.shop).count() == 1


@pytest.mark.django_db
def test_deleting_the_invoice_draft_reopens_the_quote(ctx) -> None:
    quote = _accepted(ctx)
    invoice = services.convert_quote_to_invoice(quote)
    drafts.delete_draft_invoice(invoice, ctx.user)
    quote.refresh_from_db()
    assert (quote.status, quote.invoice_id) == ('accepted', None)
    assert services.convert_quote_to_invoice(quote).quote == quote


@pytest.mark.django_db
def test_deleting_a_shop_removes_its_converted_quotes(ctx) -> None:
    services.convert_quote_to_invoice(_accepted(ctx))
    Shop.objects.get(pk=ctx.shop.pk).delete()
    assert not Quote.objects.exists()
    assert not Invoice.objects.exists()


@pytest.mark.django_db
def test_a_quote_never_touches_stock(ctx) -> None:
    movements = StockMovement.objects.count()
    variant_line = {**LINE, 'description': ctx.variant.product.name}
    quote = _accepted(ctx, lines=[variant_line])
    services.convert_quote_to_invoice(quote)
    ctx.variant.refresh_from_db()
    assert StockMovement.objects.count() == movements
    assert ctx.variant.stock_quantity == 100


# Expiration


def _sent_until(ctx: SimpleNamespace, valid_until, status: str = 'sent') -> Quote:
    quote = services.send_quote(_draft(ctx))
    Quote.objects.filter(pk=quote.pk).update(valid_until=valid_until, status=status)
    return quote


@pytest.mark.django_db
def test_expire_quotes_only_touches_sent_quotes_past_validity(ctx) -> None:
    now = datetime(2026, 11, 27, 12, tzinfo=ZoneInfo('UTC'))
    today = now.date()
    past = _sent_until(ctx, today - timedelta(days=1))
    last_day = _sent_until(ctx, today)
    accepted = _sent_until(ctx, today - timedelta(days=5), status='accepted')

    assert services.expire_quotes(now) == 1
    statuses = dict(Quote.objects.values_list('pk', 'status'))
    assert statuses[past.pk] == 'expired'
    assert statuses[last_day.pk] == 'sent'
    assert statuses[accepted.pk] == 'accepted'
    with pytest.raises(services.QuoteStateError):
        services.mark_accepted_manually(past)


@pytest.mark.django_db
def test_expiration_uses_each_shop_timezone(ctx) -> None:
    """27 nov. 14:00 UTC : déjà le 28 à Nouméa (1 h), encore le 27 à Paris."""
    _, other_shop, _, other_customer = _make_shop('noumea@example.com')
    Shop.objects.filter(pk=other_shop.pk).update(timezone='Pacific/Noumea')
    other_shop.refresh_from_db()
    other = SimpleNamespace(shop=other_shop, customer=other_customer)
    day = datetime(2026, 11, 27).date()
    paris = _sent_until(ctx, day)
    noumea = _sent_until(other, day)

    services.expire_quotes(datetime(2026, 11, 27, 14, tzinfo=ZoneInfo('UTC')))
    assert Quote.objects.get(pk=paris.pk).status == 'sent'
    assert Quote.objects.get(pk=noumea.pk).status == 'expired'


# Multi-tenant


@pytest.mark.django_db
def test_customer_of_another_shop_is_refused(ctx) -> None:
    _, _, _, foreign = _make_shop('foreign-quote@example.com')
    with pytest.raises(ValidationError):
        _draft(ctx, customer=foreign.pk)
    quote = _draft(ctx)
    with pytest.raises(ValidationError):
        services.update_draft_quote(quote, {'customer': foreign.pk}, quote.updated_at)
    assert Quote.objects.get(pk=quote.pk).customer == ctx.customer


@pytest.mark.django_db
def test_each_shop_has_its_own_quote_series(ctx) -> None:
    _, other_shop, _, other_customer = _make_shop('series-quote@example.com')
    other = SimpleNamespace(shop=other_shop, customer=other_customer)
    mine = services.send_quote(_draft(ctx))
    theirs = services.send_quote(_draft(other))
    assert mine.number.endswith('-0001') and theirs.number.endswith('-0001')
    assert theirs.lines.get().shop == other_shop
    assert (
        services.convert_quote_to_invoice(services.mark_accepted_manually(theirs)).shop
        == other_shop
    )


class ConcurrentQuoteTest(TransactionTestCase):
    """Double clic, deux onglets : un seul envoi, une seule facture."""

    serialized_rollback = True

    def _race(self, action, quotes: list[Quote]) -> list[object]:
        barrier = threading.Barrier(len(quotes))
        results: list[object] = []

        def worker(quote: Quote) -> None:
            try:
                barrier.wait()
                results.append(action(quote))
            except BaseException as exc:  # noqa: BLE001 — on compare les issues.
                results.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker, args=(q,)) for q in quotes]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        return results

    def _ctx(self, email: str) -> SimpleNamespace:
        _, shop, _, customer = _make_shop(email)
        return SimpleNamespace(shop=shop, customer=customer)

    def test_same_quote_converted_twice_at_once(self) -> None:
        ctx = self._ctx('race-convert@example.com')
        quote = _accepted(ctx)
        results = self._race(
            services.convert_quote_to_invoice, [quote, Quote.objects.get(pk=quote.pk)]
        )
        errors = [r for r in results if isinstance(r, BaseException)]
        assert len(results) == 2
        assert [type(e) for e in errors] == [services.QuoteStateError]
        invoices = Invoice.objects.filter(shop=ctx.shop)
        assert invoices.count() == 1
        assert Quote.objects.get(pk=quote.pk).invoice_id == invoices.get().pk

    def test_same_draft_sent_twice_at_once(self) -> None:
        ctx = self._ctx('race-send@example.com')
        draft = _draft(ctx)
        results = self._race(
            services.send_quote, [draft, Quote.objects.get(pk=draft.pk)]
        )
        errors = [r for r in results if isinstance(r, BaseException)]
        assert [type(e) for e in errors] == [services.QuoteStateError]
        assert _quote_counter(ctx.shop) == 1
