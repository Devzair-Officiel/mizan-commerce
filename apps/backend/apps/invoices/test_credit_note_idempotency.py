"""Avoirs (URS-112) : clé d'idempotence (en-tête Idempotency-Key) à la création."""

from uuid import UUID, uuid4

import pytest
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from apps.core.models import AuditLog
from apps.core.testing import race_on_lock, run_while_paused

from . import credit_notes
from .models import DocumentSequence, Invoice
from .test_credit_note_api import _ctx, _rows, _url
from .test_credit_notes import _issued


@pytest.fixture
def ctx():
    return _ctx('credit-key@example.com')


def _post(api: APIClient, invoice: Invoice, key: UUID | str | None, **body):
    body.setdefault('reason', 'Retour client')
    body.setdefault('mode', 'partial' if 'lines' in body else 'total')
    headers = {} if key is None else {'HTTP_IDEMPOTENCY_KEY': str(key)}
    return api.post(_url(invoice), body, format='json', **headers)


def _last_number(invoice: Invoice) -> int:
    return DocumentSequence.objects.get(
        shop_id=invoice.shop_id, kind=DocumentSequence.KIND_CREDIT_NOTE
    ).last_number


def _notes() -> int:
    return Invoice.objects.filter(kind=Invoice.KIND_CREDIT_NOTE).count()


@pytest.mark.django_db
def test_same_key_returns_the_same_credit_note_without_new_number(ctx) -> None:
    invoice, key = _issued(ctx), uuid4()
    first = _post(ctx.api, invoice, key, lines=_rows(invoice, '1'))
    number = _last_number(invoice)
    again = _post(ctx.api, invoice, key, lines=_rows(invoice, '1'))
    assert (first.status_code, again.status_code) == (201, 201)
    assert again.data == first.data
    assert (_notes(), _last_number(invoice)) == (1, number)
    assert AuditLog.objects.filter(action='credit_note_issued').count() == 1
    note = Invoice.objects.get(kind=Invoice.KIND_CREDIT_NOTE)
    assert (note.idempotency_key, 'idempotency_key' in first.data) == (key, False)


@pytest.mark.django_db
def test_replay_is_answered_even_once_nothing_is_left_to_credit(ctx) -> None:
    invoice, key = _issued(ctx), uuid4()
    first = _post(ctx.api, invoice, key)
    assert Invoice.objects.get(pk=invoice.pk).is_fully_credited
    again = _post(ctx.api, invoice, key)
    assert (again.status_code, again.data['id']) == (201, first.data['id'])


@pytest.mark.django_db
def test_different_keys_and_no_key_create_distinct_credit_notes(ctx) -> None:
    invoice = _issued(ctx)
    responses = [
        _post(ctx.api, invoice, key, lines=_rows(invoice, '1'))
        for key in (uuid4(), uuid4(), None)
    ]
    assert [r.status_code for r in responses] == [201, 201, 201]
    assert len({r.data['number'] for r in responses}) == 3


@pytest.mark.django_db
def test_key_of_another_shop_does_not_collide(ctx) -> None:
    other = _ctx('credit-key-other@example.com')
    mine, theirs, key = _issued(ctx), _issued(other), uuid4()
    first = _post(ctx.api, mine, key, lines=_rows(mine, '1'))
    second = _post(other.api, theirs, key, lines=_rows(theirs, '1'))
    assert (first.status_code, second.status_code) == (201, 201)
    assert second.data['id'] != first.data['id']
    assert second.data['credited_invoice'] == theirs.pk


@pytest.mark.django_db
def test_key_reused_on_another_invoice_is_a_conflict(ctx) -> None:
    invoice, sibling, key = _issued(ctx), _issued(ctx), uuid4()
    _post(ctx.api, invoice, key, lines=_rows(invoice, '1'))
    response = _post(ctx.api, sibling, key, lines=_rows(sibling, '1'))
    assert (response.status_code, response.data['code']) == (
        409,
        'idempotency_key_reused',
    )
    assert Invoice.objects.get(pk=sibling.pk).credited_total == 0


@pytest.mark.django_db
def test_invalid_key_is_a_bad_request(ctx) -> None:
    invoice = _issued(ctx)
    response = _post(ctx.api, invoice, 'pas-un-uuid')
    assert (response.status_code, response.data['code']) == (
        400,
        'invalid_idempotency_key',
    )
    assert _notes() == 0


class ConcurrentIdempotencyTest(TransactionTestCase):
    """Vrais threads : le premier POST s'arrête, verrous tenus, avant de lire ce
    qui est déjà crédité ; le second attend le verrou de la boutique, ou non."""

    serialized_rollback = True

    def _request(self, ctx, invoice: Invoice, key: UUID):
        def send():
            api = APIClient()
            api.force_authenticate(ctx.user)
            return _post(api, invoice, key, lines=_rows(invoice, '1'))

        return send

    def test_same_key_at_the_same_time_creates_one_credit_note(self) -> None:
        ctx = _ctx('race-key-same@example.com')
        invoice, key = _issued(ctx), uuid4()
        results = race_on_lock(
            (credit_notes, '_already_credited'),
            self._request(ctx, invoice, key),
            self._request(ctx, invoice, key),
        )
        first, second = results['save'], results['issue']
        assert (first.status_code, second.status_code) == (201, 201), results
        assert second.data == first.data
        assert _notes() == 1
        assert AuditLog.objects.filter(action='credit_note_issued').count() == 1
        assert _last_number(invoice) == 1

    def test_different_keys_at_the_same_time_create_two_credit_notes(self) -> None:
        ctx = _ctx('race-key-distinct@example.com')
        invoice = _issued(ctx)
        results = race_on_lock(
            (credit_notes, '_already_credited'),
            self._request(ctx, invoice, uuid4()),
            self._request(ctx, invoice, uuid4()),
        )
        first, second = results['save'], results['issue']
        assert (first.status_code, second.status_code) == (201, 201), results
        assert first.data['number'] != second.data['number']
        assert _notes() == 2

    def test_same_key_in_another_shop_never_waits(self) -> None:
        # Le premier s'arrête après avoir inséré son avoir (transaction ouverte) :
        # une contrainte d'unicité globale ferait attendre l'autre boutique.
        mine, other = _ctx('race-key-a@example.com'), _ctx('race-key-b@example.com')
        key = uuid4()
        a, b = _issued(mine), _issued(other)
        results = run_while_paused(
            (credit_notes, '_audit'),
            self._request(mine, a, key),
            self._request(other, b, key),
        )
        held, done = results['held'], results['other']
        assert (held.status_code, done.status_code) == (201, 201), results
        assert held.data['id'] != done.data['id']
        assert set(
            Invoice.objects.filter(idempotency_key=key).values_list(
                'shop_id', flat=True
            )
        ) == {mine.shop.pk, other.shop.pk}
