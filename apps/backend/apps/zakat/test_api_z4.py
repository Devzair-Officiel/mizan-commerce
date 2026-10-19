"""API du lot Z4 : suivi à l'encaissement, « Marquer comme versée » de la fiche,
portée des lignes (boutique / personnelle) et écritures simultanées."""
import threading
import uuid
from datetime import date, timedelta
from decimal import Decimal as D
from types import ModuleType
from typing import Any, Callable
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status

from apps.core.models import AuditLog
from apps.orders.factories import OrderFactory
from . import followups, services
from .models import ZakatCalculation, ZakatReceivableFollowUp
from .test_api_z2a import COMPLETE_CHOICES
from .test_api import LIST_URL, ZakatAPITestCase, _client, _detail, _member, _shop_with_owner  # noqa: E501
from .test_followups import _fiche, _line

FOLLOWUPS_URL = reverse('zakat-followups')
HALF = {'ownership_share': '50'}


def _payment(pk) -> str:
    return reverse('zakat-calculation-payment', kwargs={'pk': pk})


def _calc_followups(pk) -> str:
    return reverse('zakat-calculation-followups', kwargs={'pk': pk})


def _action(pk, line_id) -> str:
    return reverse('zakat-followup-action', kwargs={'pk': pk, 'line_id': line_id})


def _debt(**fields) -> dict:
    return {
        'category': 'loan', 'label': 'Prêt', 'amount': '1000.00',
        'amount_within_12_months': '1000.00', **fields,
    }


class FollowUpAPITest(ZakatAPITestCase):
    def setUp(self):
        super().setUp()
        order = OrderFactory(shop=self.shop, total_amount=D('600.00'), amount_paid=D('300.00'))  # noqa: E501
        self.a, self.b = _line('600.00', order=order), _line('400.00')
        self.calc = _fiche(self.shop, self.owner, [self.a, self.b])

    def _post(self, client=None, **data):
        return (client or self.client).post(_action(self.calc.pk, self.a['id']), data, format='json')  # noqa: E501

    def test_home_lists_actionable_items_only(self):
        response = self.client.get(FOLLOWUPS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [(i['line_id'], i['state'], i['remaining']) for i in response.data],
            [(self.a['id'], 'to_pay', '7.50')],
        )

    def test_calculation_lists_each_receivable_state(self):
        response = self.client.get(_calc_followups(self.calc.pk))
        self.assertEqual(
            [(item['line_id'], item['state']) for item in response.data],
            [(self.a['id'], 'to_pay'), (self.b['id'], 'pending')],
        )

    def test_paid_once_then_409_with_current_item(self):
        response = self._post(action='paid', amount='7.50')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['state'], 'paid')
        response = self._post(action='paid', amount='7.50')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['item']['state'], 'paid')

    def test_invalid_actions_get_400(self):
        cases = [
            {'action': 'paid'},
            {'action': 'revert'},
            {'action': 'unknown'},
            {'action': 'paid', 'amount': '0'},
            {'action': 'option', 'option': 'all_years'},
            {'action': 'collected', 'collected_on': '2025-06-01', 'amount': '100.00'},
        ]
        for data in cases:
            with self.subTest(data=data):
                self.assertEqual(self._post(**data).status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
        self.assertFalse(ZakatReceivableFollowUp.objects.exists())

    def test_other_admin_and_other_shop_get_404(self):
        others = [
            _client(_member(self.shop, 'other@example.com')),
            _client(_shop_with_owner('second@example.com')[1]),
        ]
        for client in others:
            with self.subTest():
                self.assertEqual(client.get(FOLLOWUPS_URL).data, [])
                self.assertEqual(client.get(_calc_followups(self.calc.pk)).status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501
                self.assertEqual(self._post(client, action='ignore').status_code, status.HTTP_404_NOT_FOUND)  # noqa: E501
        self.assertFalse(ZakatReceivableFollowUp.objects.exists())


class PaymentAPITest(ZakatAPITestCase):
    """Complément 3 : « Marquer comme versée » sur la fiche, modifiable, « Revenir »."""

    def setUp(self):
        super().setUp()
        self.calc = _fiche(self.shop, self.owner, [], receivables_mode='yearly')
        self.url = _payment(self.calc.pk)

    def _put(self, client=None, **data):
        self.calc.refresh_from_db()
        payload = {'version': self.calc.version, 'paid_on': '2025-04-01', 'paid_amount': '250.00', **data}  # noqa: E501
        return (client or self.client).put(self.url, payload, format='json')

    def _paid_logs(self) -> list[tuple[str, dict]]:
        logs = AuditLog.objects.filter(model_name='ZakatCalculation', action__startswith='zakat_paid')  # noqa: E501
        return sorted(logs.values_list('action', 'changes'))

    def test_mark_change_and_revert(self):
        response = self._put()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual((response.data['paid_on'], response.data['paid_amount']), ('2025-04-01', '250.00'))  # noqa: E501
        self.assertEqual(self._put(paid_amount='260.00').data['paid_amount'], '260.00')
        response = self.client.delete(self.url, {'version': self.calc.version + 1}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual((response.data['paid_on'], response.data['paid_amount']), (None, None))  # noqa: E501
        self.assertEqual(self._paid_logs(), [
            ('zakat_paid', {}), ('zakat_paid_changed', {}), ('zakat_paid_reverted', {}),
        ])

    def test_stale_version_future_date_and_zero_amount_refused(self):
        tomorrow = services.shop_today(self.shop) + timedelta(days=1)
        self.assertEqual(self._put(version=99).status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self._put(paid_on=str(tomorrow)).status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
        self.assertEqual(self._put(paid_amount='0').status_code, status.HTTP_400_BAD_REQUEST)  # noqa: E501
        self.calc.refresh_from_db()
        self.assertIsNone(self.calc.paid_on)
        self.assertEqual(self._paid_logs(), [])

    def test_other_admin_gets_404(self):
        other = _client(_member(self.shop, 'other@example.com'))
        self.assertEqual(self._put(other).status_code, status.HTTP_404_NOT_FOUND)
        response = other.delete(self.url, {'version': self.calc.version}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_history_keeps_paid_amount_when_fiche_changes(self):
        self._put()
        ZakatCalculation.objects.filter(pk=self.calc.pk).update(cash_amount=D('12000.00'))
        row = self.client.get(LIST_URL).data['results'][0]
        self.assertEqual((row['paid_on'], row['paid_amount']), ('2025-04-01', '250.00'))
        self.assertEqual(row['totals']['zakat_total'], '300.00')


class ScopeAPITest(ZakatAPITestCase):
    """Portée des lignes : `null` tant que la personne n'a pas choisi (« boutique »
    à 100 %, à préciser en dessous) ; commande toujours boutique."""

    def _fiche_with_unchosen_lines(self) -> dict:
        response = self._create(
            choices={**COMPLETE_CHOICES, 'debts_mode': 'all'}, cash_amount='20000.00',
            receivable_items=[{'label': 'Client', 'amount': '400.00'}], debt_items=[_debt()],  # noqa: E501
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data

    def _patch(self, calc: dict, **data):
        return self.client.patch(_detail(calc['id']), {'version': calc['version'], **data}, format='json')  # noqa: E501

    def test_full_share_unchosen_lines_do_not_block(self):
        calc = self._fiche_with_unchosen_lines()
        debt_id = calc['debt_items'][0]['id']
        self.assertEqual([calc[k][0]['scope'] for k in ('receivable_items', 'debt_items')], [None, None])  # noqa: E501
        uuid.UUID(debt_id)
        totals = calc['totals']
        self.assertEqual((totals['status'], totals['missing_scopes']), ('above_nisab', {}))  # noqa: E501
        self.assertEqual(totals['debt_deducted'], {debt_id: '1000.00'})
        # (20 000 + 400 − 1 000) × 2,5 % = 485.
        self.assertEqual(totals['zakat_total'], '485.00')

    def test_lower_share_asks_for_unchosen_scopes(self):
        calc = self._fiche_with_unchosen_lines()
        response = self._patch(calc, choices=HALF)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        totals = response.data['totals']
        self.assertEqual((totals['status'], totals['missing_choices']), ('choice_missing', []))  # noqa: E501
        self.assertEqual(totals['missing_scopes'], {
            'receivables': [calc['receivable_items'][0]['id']],
            'debts': [calc['debt_items'][0]['id']],
        })
        # Rien de déduit à tort : ni la part, ni le montant entier.
        for name in ('debts_total', 'debts_deducted', 'receivables_sure', 'base', 'zakat_total'):  # noqa: E501
            self.assertIsNone(totals[name], name)
        self.assertEqual(list(totals['debt_deducted'].values()), [None])

    def test_chosen_scopes_compute(self):
        calc = self._patch(self._fiche_with_unchosen_lines(), choices=HALF).data
        response = self._patch(
            calc,
            receivable_items=[{**calc['receivable_items'][0], 'scope': 'shop'}],
            debt_items=[{**calc['debt_items'][0], 'scope': 'personal'}],
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        totals = response.data['totals']
        self.assertEqual((totals['status'], totals['missing_scopes']), ('above_nisab', {}))  # noqa: E501
        self.assertEqual(totals['debt_deducted'], {calc['debt_items'][0]['id']: '1000.00'})  # noqa: E501
        # 10 000 + 200 − 1 000 = 9 200 ; × 2,5 % = 230.
        self.assertEqual((totals['debts_deducted'], totals['zakat_total']), ('1000.00', '230.00'))  # noqa: E501

    def test_order_line_cannot_be_personal(self):
        order = OrderFactory(shop=self.shop, total_amount=D('100.00'))
        line = {'order_id': str(order.pk), 'label': 'Client', 'amount': '100.00', 'scope': 'personal'}  # noqa: E501
        response = self._create(receivable_items=[line])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('receivable_items', response.data['errors'])

    def test_order_line_is_shop(self):
        order = OrderFactory(shop=self.shop, total_amount=D('100.00'))
        line = {'order_id': str(order.pk), 'label': 'Client', 'amount': '100.00'}
        response = self._create(choices=HALF, receivable_items=[line])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['receivable_items'][0]['scope'], 'shop')
        self.assertEqual(response.data['totals']['missing_scopes'], {})

    def test_duplicate_ids_refused(self):
        line = {'id': str(uuid.uuid4()), 'label': 'Prêt', 'amount': '10.00'}
        response = self._create(receivable_items=[line, dict(line)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


def _race(module: ModuleType, name: str, work: Callable[[], Any]) -> list[Any]:
    """`work` dans deux threads qui se rejoignent juste avant `module.name`."""
    original = getattr(module, name)
    barrier = threading.Barrier(2)
    results: list[Any] = []

    def synced(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)

    def worker() -> None:
        try:
            results.append(work())
        except BaseException as exc:  # noqa: BLE001 — on compare les issues.
            results.append(exc)
        finally:
            connection.close()

    with patch.object(module, name, synced):
        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
    return results


class ConcurrentPaymentTest(TransactionTestCase):
    """Deux « Marquer comme versée » simultanés : un seul passe, l'autre reçoit 409."""

    serialized_rollback = True

    def setUp(self):
        self.shop, self.owner = _shop_with_owner('race@example.com')

    def test_followup_paid_once(self):
        order = OrderFactory(shop=self.shop, total_amount=D('600.00'), amount_paid=D('300.00'))  # noqa: E501
        line = _line('600.00', order=order)
        calc = _fiche(self.shop, self.owner, [line])
        results = _race(
            followups, '_target_row',
            lambda: followups.mark_paid(self.shop, self.owner, calc.pk, line['id'], D('7.50')),  # noqa: E501
        )
        self.assertEqual(sorted(type(r).__name__ for r in results), ['FollowUpConflictError', 'FollowUpItem'])  # noqa: E501
        self.assertEqual(ZakatReceivableFollowUp.objects.get().paid_amount, D('7.50'))
        self.assertEqual(AuditLog.objects.filter(action='zakat_followup_paid').count(), 1)  # noqa: E501

    def test_fiche_paid_once(self):
        calc = _fiche(self.shop, self.owner, [], receivables_mode='yearly')

        def work() -> ZakatCalculation:
            fresh = ZakatCalculation.objects.get(pk=calc.pk)
            return services.set_payment(
                fresh, self.owner, paid_on=date(2025, 4, 1), paid_amount=D('250.00'),
                expected_version=fresh.version,
            )

        results = _race(services, '_conditional_write', work)
        self.assertEqual(sorted(type(r).__name__ for r in results), ['VersionConflictError', 'ZakatCalculation'])  # noqa: E501
        self.assertEqual(AuditLog.objects.filter(action__startswith='zakat_paid').count(), 1)  # noqa: E501
