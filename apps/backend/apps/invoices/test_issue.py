"""Émission d'une facture libre (URS-110) : numéro continu, instantanés figés."""

import threading
import time
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.models import AuditLog
from apps.customers.models import Customer
from apps.orders.models import OrderItem
from apps.orders.services import add_item
from apps.shops.factories import ShopFactory

from . import drafts, services
from .models import DocumentSequence, Invoice
from .tests import _make_order_with_items, _make_shop

LINE = {
    'description': 'Accompagnement',
    'details': 'Atelier de 3 h',
    'unit': 'séance',
    'quantity': Decimal('2'),
    'unit_price_ht': Decimal('150.00'),
}


def _draft(shop, customer, **data) -> Invoice:
    return drafts.create_draft_invoice(
        shop, {'customer': customer.pk, 'lines': [LINE], **data}
    )


def _last_number(shop) -> int:
    sequence = DocumentSequence.objects.filter(shop=shop, kind='invoice').first()
    return sequence.last_number if sequence else 0


@pytest.fixture
def ctx():
    user, shop, _, customer = _make_shop('issue@example.com')
    api = APIClient()
    api.force_authenticate(user)
    return api, user, shop, customer


def _issue(api, invoice: Invoice, warnings: list[str] | None = None):
    payload = {'acknowledged_warnings': warnings} if warnings is not None else {}
    return api.post(reverse('invoice-issue', args=[invoice.pk]), payload, format='json')  # noqa: E501


@pytest.mark.django_db
def test_issue_numbers_dates_and_freezes_snapshots(ctx) -> None:
    api, user, shop, customer = ctx
    draft = _draft(shop, customer, payment_terms_days=15)
    response = _issue(api, draft)
    assert response.status_code == 200, response.data
    invoice = Invoice.objects.get(pk=draft.pk)
    issued_on = invoice.issued_at.astimezone(ZoneInfo(shop.timezone)).date()
    assert invoice.status == 'issued'
    assert invoice.number == f'fact-{issued_on:%d%m%y}-0001'
    assert invoice.due_date == issued_on + timedelta(days=15)
    assert invoice.seller_address == shop.legal_address
    assert invoice.seller_tax_id == shop.tax_id
    assert invoice.buyer_name == customer.display_name
    assert invoice.presentation  # Instantané de présentation, comme une commande.
    assert invoice.presentation['operation_category'] == invoice.operation_category
    assert invoice.total_ttc == Decimal('360.00')
    log = AuditLog.objects.get(action='invoice_issued')
    assert (log.object_id, log.object_repr) == (str(invoice.pk), invoice.number)
    assert log.changes == {'total_ttc': '360.00', 'warnings': []}
    # Émise : statut de paiement et PDF redeviennent possibles.
    paid = api.patch(reverse('invoice-status', args=[invoice.pk]), {'status': 'paid'})
    assert paid.status_code == 200


@pytest.mark.django_db
def test_seller_changes_after_issue_do_not_touch_the_invoice(ctx) -> None:
    api, _, shop, customer = ctx
    draft = _draft(shop, customer)
    _issue(api, draft)
    shop.legal_address = 'Nouvelle adresse'
    shop.save()
    customer.name = 'Renommé'
    customer.save()
    invoice = Invoice.objects.get(pk=draft.pk)
    assert invoice.seller_address == '10 rue de Paris\n75001 Paris'
    assert invoice.buyer_name != customer.display_name


@pytest.mark.django_db
def test_business_customer_siren_is_snapshotted(ctx) -> None:
    api, _, shop, _ = ctx
    business = Customer.objects.create(
        shop=shop, name='Atelier', customer_type='business', siren='123456789'
    )
    draft = _draft(shop, business)
    assert _issue(api, draft).status_code == 200
    assert Invoice.objects.get(pk=draft.pk).buyer_siren == '123456789'


@pytest.mark.django_db
def test_blocking_issue_refuses_and_consumes_no_number(ctx) -> None:
    api, _, shop, _ = ctx
    draft = drafts.create_draft_invoice(shop, {'lines': [LINE]})
    response = _issue(api, draft, warnings=['no_customer'])
    assert response.status_code == 400
    assert response.data['code'] == 'compliance_blocking'
    assert [i['code'] for i in response.data['issues']] == ['no_customer']
    assert Invoice.objects.get(pk=draft.pk).status == 'draft'
    assert _last_number(shop) == 0


@pytest.mark.django_db
def test_recommendations_must_be_acknowledged(ctx) -> None:
    api, _, shop, customer = ctx
    shop.legal_address = ''
    shop.save()
    draft = _draft(shop, customer)
    response = _issue(api, draft)
    assert response.status_code == 409
    assert response.data['code'] == 'compliance_warnings'
    assert response.data['issues'] == [
        {'code': 'seller_address', 'level': 'recommended',
         'target': 'invoice_settings'},
    ]
    assert _last_number(shop) == 0
    response = _issue(api, draft, warnings=['seller_address'])
    assert response.status_code == 200
    log = AuditLog.objects.get(action='invoice_issued')
    assert log.changes['warnings'] == ['seller_address']


@pytest.mark.django_db
def test_second_issue_is_refused_and_numbering_has_no_gap(ctx) -> None:
    api, _, shop, customer = ctx
    first, second = _draft(shop, customer), _draft(shop, customer)
    assert _issue(api, first).status_code == 200
    response = _issue(api, first)
    assert (response.status_code, response.data['code']) == (409, 'not_draft')
    # Un échec après la réservation du numéro annule l'incrément.
    with mock.patch.object(drafts, 'snapshot_presentation', side_effect=RuntimeError):
        with pytest.raises(RuntimeError):
            drafts.issue_invoice(second, None, acknowledged_warnings=[])
    assert _last_number(shop) == 1
    assert _issue(api, second).status_code == 200
    numbers = sorted(Invoice.objects.filter(shop=shop).values_list('number', flat=True))  # noqa: E501
    assert [n.rsplit('-', 1)[1] for n in numbers] == ['0001', '0002']


@pytest.mark.django_db
def test_issued_invoice_cannot_be_deleted(ctx) -> None:
    api, _, shop, customer = ctx
    draft = _draft(shop, customer)
    _issue(api, draft)
    response = api.delete(reverse('invoice-draft', args=[draft.pk]))
    assert response.status_code == 409
    assert Invoice.objects.filter(pk=draft.pk).exists()


class ConcurrentIssueTest(TransactionTestCase):
    """Double clic ou deux onglets : une seule émission, aucun numéro perdu."""

    serialized_rollback = True

    def _race(self, invoices: list[Invoice]) -> list[object]:
        barrier = threading.Barrier(len(invoices))
        results: list[object] = []

        def worker(invoice: Invoice) -> None:
            try:
                barrier.wait()
                issued = drafts.issue_invoice(invoice, None, acknowledged_warnings=[])
                results.append(issued.number)
            except BaseException as exc:  # noqa: BLE001 — on compare les issues.
                results.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker, args=(i,)) for i in invoices]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        return results

    def test_same_draft_issued_twice_at_once(self) -> None:
        _, shop, _, customer = _make_shop('race-same@example.com')
        draft = _draft(shop, customer)
        results = self._race([draft, Invoice.objects.get(pk=draft.pk)])
        errors = [r for r in results if isinstance(r, BaseException)]
        assert len(results) == 2
        assert [type(e) for e in errors] == [drafts.NotDraftError]
        assert _last_number(shop) == 1
        nxt = drafts.issue_invoice(
            _draft(shop, customer), None, acknowledged_warnings=[]
        )
        assert nxt.number.endswith('-0002')

    def test_two_drafts_issued_at_once_get_consecutive_numbers(self) -> None:
        _, shop, _, customer = _make_shop('race-two@example.com')
        results = self._race([_draft(shop, customer), _draft(shop, customer)])
        assert sorted(str(r).rsplit('-', 1)[1] for r in results) == ['0001', '0002']
        assert _last_number(shop) == 2


@pytest.mark.django_db
def test_each_document_kind_has_its_own_continuous_series() -> None:
    shop, other = ShopFactory(), ShopFactory()
    day = date(2026, 10, 30)
    kinds = ('invoice', 'quote', 'invoice', 'credit_note', 'quote', 'invoice')
    numbers = [services._next_number(shop, kind, day) for kind in kinds]
    assert numbers == [
        'fact-301026-0001',
        'devis-301026-0001',
        'fact-301026-0002',
        'avoir-301026-0001',
        'devis-301026-0002',
        'fact-301026-0003',
    ]
    assert services._next_number(other, 'invoice', day) == 'fact-301026-0001'
    assert DocumentSequence.objects.filter(shop=shop).count() == 3


def _wait_until_blocked(pid: int) -> None:
    """Attend que la session `pid` soit bloquée par le verrou d'une autre."""
    with connection.cursor() as cursor:
        for _ in range(400):
            cursor.execute('SELECT cardinality(pg_blocking_pids(%s))', [pid])
            if cursor.fetchone()[0]:
                return
            time.sleep(0.025)
    raise AssertionError("L'émission n'a jamais attendu le verrou du document.")


def _race_on_lock(pause: tuple[object, str], save, issue) -> dict[str, object]:
    """`save` s'arrête sur `pause` (verrou du document tenu) ; `issue` part, et
    `save` ne repart que lorsque `issue` est bloqué par ce verrou."""
    paused, release = threading.Event(), threading.Event()
    pids: list[int] = []
    results: dict[str, object] = {}
    original = getattr(*pause)

    def hold(*args, **kwargs):
        paused.set()
        release.wait(timeout=20)
        return original(*args, **kwargs)

    def run(name: str, action) -> None:
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_backend_pid()')
                pids.append(cursor.fetchone()[0])
            results[name] = action()
        except BaseException as exc:  # noqa: BLE001 — on compare les issues.
            results[name] = exc
        finally:
            connection.close()

    with mock.patch.object(*pause, hold):
        saver = threading.Thread(target=run, args=('save', save))
        saver.start()
        assert paused.wait(timeout=20)
        issuer = threading.Thread(target=run, args=('issue', issue))
        issuer.start()
        for _ in range(400):
            if len(pids) == 2:
                break
            time.sleep(0.025)
        _wait_until_blocked(pids[-1])
        release.set()
        for thread in (saver, issuer):
            thread.join(timeout=20)
    return results


class ShopLockTest(TransactionTestCase):
    """Enregistrement contre émission : aucun interblocage (500 côté utilisateur).

    L'enregistrement verrouille la ligne du document, puis insère des lignes : le
    contrôle de clé étrangère prend `FOR KEY SHARE` sur la boutique. L'émission
    verrouille la boutique, puis attend la ligne du document. Ordre forcé sans
    dépendre du temps : l'enregistrement s'arrête avant d'insérer et ne repart
    que lorsque l'émission est bloquée par son verrou.
    """

    serialized_rollback = True

    def test_draft_saved_while_being_issued(self) -> None:
        _, shop, _, customer = _make_shop('lock-draft@example.com')
        draft = _draft(shop, customer)
        saved = {**LINE, 'description': 'Atelier complet', 'quantity': Decimal('3')}
        results = _race_on_lock(
            (drafts, '_build_lines'),
            lambda: drafts.update_draft_invoice(
                draft, {'lines': [saved]}, draft.updated_at
            ),
            lambda: drafts.issue_invoice(
                Invoice.objects.get(pk=draft.pk), None, acknowledged_warnings=[]
            ),
        )
        assert not [r for r in results.values() if isinstance(r, BaseException)]
        # L'émission attend l'enregistrement et fige la version enregistrée.
        issued = results['issue']
        assert issued.number.endswith('-0001')
        assert list(issued.lines.values_list('description', flat=True)) == [
            'Atelier complet'
        ]
        assert issued.subtotal_ht == Decimal('450.00')

    def test_order_item_added_while_its_invoice_is_issued(self) -> None:
        user, shop, variant, customer = _make_shop('lock-order@example.com')
        order = _make_order_with_items(shop, user, variant, customer)
        results = _race_on_lock(
            (OrderItem.objects, 'create'),
            lambda: add_item(order, variant, 1, user=user),
            lambda: services.issue_invoice_from_order(shop=shop, order=order),
        )
        assert not [r for r in results.values() if isinstance(r, BaseException)]
        assert results['issue'].lines.count() == 2
