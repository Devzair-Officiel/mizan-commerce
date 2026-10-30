"""Avoirs (URS-112) : total ou partiel, plafond atomique, instantanés copiés."""

from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.db import IntegrityError, connection, transaction
from django.test import TransactionTestCase
from rest_framework.exceptions import NotFound, ValidationError

from apps.core.testing import race_on_lock
from apps.orders.models import Order
from apps.shops.models import Shop
from apps.stock.models import StockMovement

from . import credit_notes, drafts, services
from .models import DocumentSequence, Invoice, InvoiceLine
from .tests import _make_order_with_items, _make_shop

# 3 × 10,00 + 2 × 25,00 = 80,00 HT ; remise 8,00 ; livraison 5,00 ; TVA 20 %.
LINES = [
    {
        'description': 'Atelier',
        'quantity': Decimal('3'),
        'unit_price_ht': Decimal('10.00'),
    },  # noqa: E501
    {
        'description': 'Coaching',
        'quantity': Decimal('2'),
        'unit_price_ht': Decimal('25.00'),
    },  # noqa: E501
]
TOTALS = (
    'subtotal_ht',
    'discount_amount',
    'shipping_amount',
    'tax_amount',
    'total_ttc',
)


def _ctx(email: str) -> SimpleNamespace:
    user, shop, variant, customer = _make_shop(email)
    return SimpleNamespace(user=user, shop=shop, variant=variant, customer=customer)


@pytest.fixture
def ctx() -> SimpleNamespace:
    return _ctx('credit@example.com')


def _issued(ctx: SimpleNamespace, lines=LINES, **data) -> Invoice:
    data = {
        'discount_amount': Decimal('8.00'),
        'shipping_amount': Decimal('5.00'),
        **data,
    }  # noqa: E501
    draft = drafts.create_draft_invoice(
        ctx.shop, {'customer': ctx.customer.pk, 'lines': lines, **data}
    )
    return drafts.issue_invoice(draft, None, acknowledged_warnings=[])


def _credit(ctx: SimpleNamespace, invoice: Invoice, lines=None, **options) -> Invoice:
    options.setdefault('acknowledged_warnings', [])
    return credit_notes.issue_credit_note(
        ctx.shop,
        invoice,
        lines,
        options.pop('reason', 'Erreur de saisie'),
        None,
        **options,
    )


def _rows(invoice: Invoice, *quantities: str) -> list[dict]:
    """Quantité à créditer par ligne, dans l'ordre ; `None` saute la ligne."""
    return [
        {'line': line.pk, 'quantity': Decimal(qty)}
        for line, qty in zip(invoice.lines.all(), quantities, strict=False)
        if qty is not None
    ]


def _amounts(document: Invoice) -> tuple[Decimal, ...]:
    return tuple(getattr(document, field) for field in TOTALS)


def _counter(shop: Shop) -> int:
    sequence = DocumentSequence.objects.filter(shop=shop, kind='credit_note').first()
    return sequence.last_number if sequence else 0


def _credited(invoice: Invoice) -> Decimal:
    return Invoice.objects.get(pk=invoice.pk).credited_total


# Avoir total


@pytest.mark.django_db
def test_total_credit_note_mirrors_the_invoice_then_nothing_is_left(ctx) -> None:
    invoice = _issued(ctx)
    note = _credit(ctx, invoice, reason='  Commande annulée  ')
    issued_on = invoice.presentation['issued_date']
    assert (note.kind, note.status, note.credited_invoice_id) == (
        'credit_note',
        'issued',
        invoice.pk,
    )
    assert note.number.startswith('avoir-') and note.number.endswith('-0001')
    assert note.credit_reason == 'Commande annulée'
    assert _amounts(note) == _amounts(invoice)
    assert note.total_ttc == Decimal('92.40')
    assert [(line.description, line.quantity) for line in note.lines.all()] == [
        ('Atelier', Decimal('3')),
        ('Coaching', Decimal('2')),
    ]
    assert (note.due_date, note.order_id, note.amount_paid) == (None, None, 0)
    assert note.presentation['credited_number'] == invoice.number
    assert note.presentation['credited_issued_date'] == issued_on
    assert _credited(invoice) == Decimal('92.40')
    # Une facture entièrement créditée reste émise (« Créditée », D6).
    assert Invoice.objects.get(pk=invoice.pk).status == 'issued'

    with pytest.raises(credit_notes.CreditNoteError) as total:
        _credit(ctx, invoice)
    with pytest.raises(credit_notes.CreditNoteError) as partial:
        _credit(ctx, invoice, _rows(invoice, '1'))
    assert (total.value.code, partial.value.code) == (
        'nothing_to_credit',
        'over_credit',
    )
    assert _counter(ctx.shop) == 1


@pytest.mark.django_db
def test_paid_invoice_can_be_credited(ctx) -> None:
    invoice = services.mark_paid(_issued(ctx))
    note = _credit(ctx, invoice, _rows(invoice, '1'))
    paid = Invoice.objects.get(pk=invoice.pk)
    assert (paid.status, paid.credited_total) == ('paid', note.total_ttc)


# Avoir partiel


@pytest.mark.django_db
def test_partial_credit_note_takes_the_discount_pro_rata(ctx) -> None:
    invoice = _issued(ctx)
    note = _credit(ctx, invoice, _rows(invoice, '1', None))
    # 10,00 HT sur 80,00 : remise 8,00 × 10/80 = 1,00 ; base 9,00 ; TVA 1,80.
    assert _amounts(note) == (
        Decimal('10.00'),
        Decimal('1.00'),
        Decimal('0'),
        Decimal('1.80'),
        Decimal('10.80'),  # noqa: E501
    )
    assert [line.position for line in note.lines.all()] == [0]
    with_shipping = _credit(
        ctx, invoice, _rows(invoice, None, '1'), include_shipping=True
    )  # noqa: E501
    # 25,00 HT : remise 2,50 ; livraison 5,00 ; base 27,50 ; TVA 5,50.
    assert with_shipping.total_ttc == Decimal('33.00')
    assert _credited(invoice) == Decimal('43.80')
    assert note.number[-4:] == '0001' and with_shipping.number[-4:] == '0002'


@pytest.mark.django_db
def test_three_partials_never_exceed_and_the_last_one_settles_exactly(ctx) -> None:
    """3 × 3,33 = 9,99 HT, remise 1,00, TVA 20 % : 10,79 TTC. Trois tiers arrondis
    feraient 3 × 3,60 = 10,80 ; le dernier crédite le reste exact."""
    line = {
        'description': 'Lot',
        'quantity': Decimal('3'),
        'unit_price_ht': Decimal('3.33'),
    }  # noqa: E501
    invoice = _issued(
        ctx, [line], discount_amount=Decimal('1.00'), shipping_amount=Decimal('0')
    )  # noqa: E501
    assert invoice.total_ttc == Decimal('10.79')
    notes = [_credit(ctx, invoice, _rows(invoice, '1')) for _ in range(3)]
    assert [n.total_ttc for n in notes] == [
        Decimal('3.60'),
        Decimal('3.60'),
        Decimal('3.59'),
    ]  # noqa: E501
    assert notes[2].discount_amount == Decimal('0.34')
    for field in TOTALS:
        assert sum(getattr(n, field) for n in notes) == getattr(invoice, field), field
    assert _credited(invoice) == invoice.total_ttc
    with pytest.raises(credit_notes.CreditNoteError):
        _credit(ctx, invoice, _rows(invoice, '0.5'))


@pytest.mark.django_db
def test_settling_note_after_partials_credits_the_exact_rest(ctx) -> None:
    invoice = _issued(ctx)
    first = _credit(ctx, invoice, _rows(invoice, '1', '1'))
    rest = _credit(ctx, invoice)  # Total : tout le reste, livraison comprise.
    for field in TOTALS:
        assert getattr(first, field) + getattr(rest, field) == getattr(invoice, field)
    assert [(line.position, line.quantity) for line in rest.lines.all()] == [
        (0, Decimal('2')),
        (1, Decimal('1')),
    ]
    assert _credited(invoice) == invoice.total_ttc


@pytest.mark.django_db
def test_quantities_only_go_down_line_by_line(ctx) -> None:
    invoice = _issued(ctx)
    other = _issued(ctx)
    foreign_line = {'line': other.lines.first().pk, 'quantity': Decimal('1')}
    for rows in (
        _rows(invoice, '4'),  # Plus que la ligne.
        _rows(invoice, '0'),
        _rows(invoice, '-1'),
        [foreign_line],
        _rows(invoice, '1') * 2,
    ):
        with pytest.raises(ValidationError):
            _credit(ctx, invoice, rows)
    _credit(ctx, invoice, _rows(invoice, '2'))
    with pytest.raises(credit_notes.CreditNoteError) as exc:
        _credit(ctx, invoice, _rows(invoice, '2'))  # Il n'en reste qu'une.
    assert exc.value.code == 'over_credit'
    with pytest.raises(credit_notes.CreditNoteError) as empty:
        _credit(ctx, invoice, [])
    assert empty.value.code == 'nothing_to_credit'


# Refus


@pytest.mark.django_db
def test_draft_cancelled_and_credit_notes_are_refused(ctx) -> None:
    draft = drafts.create_draft_invoice(ctx.shop, {'lines': LINES})
    cancelled = services.cancel_invoice(_issued(ctx))
    note = _credit(ctx, _issued(ctx))
    codes = []
    for invoice in (draft, cancelled, note):
        with pytest.raises(credit_notes.CreditNoteError) as exc:
            _credit(ctx, invoice)
        codes.append(exc.value.code)
    assert codes == ['invoice_draft', 'invoice_cancelled', 'credit_note_of_credit_note']
    with pytest.raises(ValidationError):
        _credit(ctx, _issued(ctx), reason='   ')
    assert _counter(ctx.shop) == 1


@pytest.mark.django_db
def test_credit_note_is_terminal(ctx) -> None:
    note = _credit(ctx, _issued(ctx))
    for transition in (services.mark_paid, services.cancel_invoice):
        with pytest.raises(services.InvoiceStateError):
            transition(note)
    assert Invoice.objects.get(pk=note.pk).status == 'issued'


@pytest.mark.django_db
def test_failed_credit_note_consumes_no_number(ctx) -> None:
    invoice = _issued(ctx)
    # État incohérent simulé : le plafond atomique refuse quand même.
    Invoice.objects.filter(pk=invoice.pk).update(credited_total=Decimal('90.00'))
    with pytest.raises(credit_notes.CreditNoteError) as exc:
        _credit(ctx, invoice, _rows(invoice, '1'))
    assert exc.value.code == 'over_credit'
    assert (_counter(ctx.shop), _credited(invoice)) == (0, Decimal('90.00'))
    assert not Invoice.objects.filter(kind='credit_note').exists()


@pytest.mark.django_db
def test_recommendations_follow_the_invoice_snapshot(ctx) -> None:
    invoice = _issued(ctx)
    Invoice.objects.filter(pk=invoice.pk).update(seller_address='')
    with pytest.raises(drafts.ComplianceError) as exc:
        _credit(ctx, invoice)
    assert [i.code for i in exc.value.issues] == ['seller_address']
    assert _counter(ctx.shop) == 0
    note = _credit(ctx, invoice, acknowledged_warnings=['seller_address'])
    assert note.seller_address == ''


# Instantanés, boutique, stock


@pytest.mark.django_db
def test_snapshots_are_copied_from_the_invoice_not_the_shop(ctx) -> None:
    invoice = _issued(ctx)
    Shop.objects.filter(pk=ctx.shop.pk).update(
        name='Nouveau nom',
        legal_address='Ailleurs',
        tax_id='',
        siret='',
        default_tax_rate=Decimal('5.50'),
        invoice_color='#000000',
    )
    ctx.customer.name = 'Renommé'
    ctx.customer.save()
    ctx.shop.refresh_from_db()
    note = _credit(ctx, invoice)
    for field in (
        *drafts.SELLER_FIELDS,
        *drafts.BUYER_FIELDS,
        'tax_rate',
        'currency',
        'operation_category',
        'customer_id',
    ):
        assert getattr(note, field) == getattr(invoice, field), field
    kept = {k: v for k, v in note.presentation.items() if not k.startswith('credited')}
    assert kept == {
        **invoice.presentation,
        'issued_date': note.presentation['issued_date'],
        'show_account_summary': False,
        'account_summary': None,
    }


@pytest.mark.django_db
def test_invoice_of_another_shop_is_not_found(ctx) -> None:
    other = _ctx('credit-other@example.com')
    theirs = _issued(other)
    with pytest.raises(NotFound):
        _credit(ctx, theirs)
    assert _credited(theirs) == 0
    assert (_counter(ctx.shop), _counter(other.shop)) == (0, 0)


@pytest.mark.django_db
def test_credit_note_never_touches_stock_nor_the_order(ctx) -> None:
    order = _make_order_with_items(ctx.shop, ctx.user, ctx.variant, ctx.customer)
    invoice = services.issue_invoice_from_order(shop=ctx.shop, order=order)
    movements = StockMovement.objects.filter(shop=ctx.shop).count()
    before = Order.objects.filter(pk=order.pk).values().get()
    _credit(ctx, invoice, _rows(invoice, '1'))
    _credit(ctx, invoice)
    assert StockMovement.objects.filter(shop=ctx.shop).count() == movements
    assert Order.objects.filter(pk=order.pk).values().get() == before
    assert Invoice.objects.get(pk=invoice.pk).order_id == order.pk


@pytest.mark.django_db
def test_credited_invoice_is_kept_but_the_shop_can_be_deleted(ctx) -> None:
    """La contrainte PostgreSQL refuse de supprimer seule une facture créditée ;
    la suppression de la boutique (`seed_data --reset`, `reset_audit_shop`)
    emporte facture et avoir."""
    invoice = _issued(ctx)
    _credit(ctx, invoice)
    with pytest.raises(IntegrityError, match='credited_invoice'), transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')
        InvoiceLine.objects.filter(invoice=invoice).delete()
        Invoice.objects.filter(pk=invoice.pk).delete()
    Shop.objects.get(pk=ctx.shop.pk).delete()
    assert not Invoice.objects.filter(shop_id=ctx.shop.pk).exists()


# Concurrence (vrais threads)


class ConcurrentCreditNoteTest(TransactionTestCase):
    """Deux avoirs sur la même facture au même moment. Le premier s'arrête, verrous
    tenus, avant de lire ce qui est déjà crédité ; le second part et attend le
    verrou de la boutique ; le premier ne repart qu'alors."""

    serialized_rollback = True

    def _race(self, ctx: SimpleNamespace, invoice: Invoice, first, second) -> dict:
        return race_on_lock(
            (credit_notes, '_already_credited'),
            lambda: _credit(ctx, invoice, _rows(invoice, *first)),
            lambda: _credit(
                ctx, Invoice.objects.get(pk=invoice.pk), _rows(invoice, *second)
            ),  # noqa: E501
        )

    def test_two_notes_exceeding_the_invoice_only_one_passes(self) -> None:
        ctx = _ctx('race-credit-over@example.com')
        invoice = _issued(ctx)
        results = self._race(ctx, invoice, ('2', '2'), ('2', '1'))
        assert isinstance(results['save'], Invoice)
        assert isinstance(results['issue'], credit_notes.CreditNoteError)
        assert results['issue'].code == 'over_credit'
        assert _credited(invoice) == results['save'].total_ttc
        assert _counter(ctx.shop) == 1

    def test_two_notes_within_the_invoice_get_consecutive_numbers(self) -> None:
        ctx = _ctx('race-credit-two@example.com')
        invoice = _issued(ctx)
        results = self._race(ctx, invoice, ('1',), (None, '1'))
        notes = [results['save'], results['issue']]
        assert all(isinstance(n, Invoice) for n in notes), results
        assert [n.number[-4:] for n in notes] == ['0001', '0002']
        assert _credited(invoice) == sum(n.total_ttc for n in notes)
