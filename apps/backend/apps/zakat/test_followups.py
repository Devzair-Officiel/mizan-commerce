"""Suivi à l'encaissement (lot Z4) : créances sûres au prorata, créances douteuses
(options D4), « Encaissée », versements, « Ignorer », « Revenir », cloisonnement."""
import uuid
from datetime import date, timedelta
from decimal import Decimal as D

from django.test import TestCase

from apps.core.models import AuditLog
from apps.orders.factories import OrderFactory
from apps.orders.models import Order
from . import followups, hawl, services
from .followups import (
    REVERT_COLLECTED,
    REVERT_IGNORE,
    REVERT_PAID,
    STATE_CANCELLED,
    STATE_CHOICE_NEEDED,
    STATE_IGNORED,
    STATE_NOTHING_DUE,
    STATE_PAID,
    STATE_PENDING,
    STATE_TO_PAY,
    FollowUpActionError,
    FollowUpConflictError,
    FollowUpNotFound,
)
from .models import ZakatCalculation, ZakatReceivableFollowUp
from .test_api import _member, _shop_with_owner

REFERENCE = date(2025, 3, 1)
EARLIER = date(2024, 3, 1)
# Seuil or à 50 le gramme → 4 250 ; trésorerie de 10 000 : au-dessus du seuil.
CHOICES = {
    'calendar': 'hijri', 'nisab_method': 'gold', 'nisab_unit_price': '50.00',
    'stock_valuation': 'sale', 'receivables_mode': 'on_collection', 'debts_mode': 'all',
    'ownership_share': '100',
}


def _line(amount: str, *, order: Order | None = None, doubtful: bool = False,
          scope: str = 'shop') -> dict:
    return {
        'id': str(uuid.uuid4()), 'order_id': str(order.pk) if order else None,
        'label': 'Prêt' if order is None else 'Client', 'amount': amount,
        'doubtful': doubtful, 'scope': scope,
    }


def _fiche(shop, user, items: list[dict], *, day: date = REFERENCE,
           cash: str = '10000.00', **choices: str) -> ZakatCalculation:
    """Fiche enregistrée telle quelle, sans l'API ni la recopie des commandes."""
    return ZakatCalculation.objects.create(
        shop=shop, user=user, currency=shop.currency, reference_date=day,
        hawl_calendar='hijri', hawl_year=hawl.hawl_year(day, 'hijri'),
        cash_amount=D(cash), receivable_items=items,
        choices_snapshot={**CHOICES, **choices},
    )


def _update(calc: ZakatCalculation, **fields) -> None:
    ZakatCalculation.objects.filter(pk=calc.pk).update(**fields)


class FollowUpTestCase(TestCase):
    """Fiche du 1er mars 2025 « à l'encaissement » : commande A (600, dont 300 réglés
    depuis) et prêt B saisi à la main (400). Zakat à l'encaissement 25 : parts 15
    et 10."""

    def setUp(self):
        self.shop, self.owner = _shop_with_owner('owner@example.com')
        self.order = OrderFactory(shop=self.shop, total_amount=D('600.00'), amount_paid=D('300.00'))  # noqa: E501
        self.a = _line('600.00', order=self.order)
        self.b = _line('400.00')
        self.calc = _fiche(self.shop, self.owner, [self.a, self.b])

    def _item(self, line: dict) -> followups.FollowUpItem | None:
        for item in followups.followup_items(self.shop, self.owner):
            if any(line_id == line['id'] for _, line_id in item.lines):
                return item
        return None

    def _act(self, name: str, line: dict, *args, calc: ZakatCalculation | None = None,
             **kwargs) -> followups.FollowUpItem:
        action = getattr(followups, name)
        return action(self.shop, self.owner, (calc or self.calc).pk, line['id'], *args, **kwargs)  # noqa: E501

    def _actionable(self) -> list[str]:
        return [item.line_id for item in followups.actionable_items(self.shop, self.owner)]  # noqa: E501


class SureReceivableTest(FollowUpTestCase):
    def test_parts_split_zakat_on_collection_by_amount(self):
        a, b = self._item(self.a), self._item(self.b)
        self.assertEqual((a.part, b.part), (D('15.00'), D('10.00')))
        self.assertEqual(a.part + b.part, services.compute_totals(self.calc).zakat_on_collection)  # noqa: E501

    def test_due_pro_rata_of_partial_payment(self):
        item = self._item(self.a)
        self.assertEqual((item.collected, item.due, item.remaining), (D('300.00'), D('7.50'), D('7.50')))  # noqa: E501
        self.assertEqual(item.state, STATE_TO_PAY)
        self.assertEqual(item.order_number, self.order.order_number)
        self.assertEqual(self._actionable(), [self.a['id']])

    def test_nothing_collected_is_pending(self):
        item = self._item(self.b)
        self.assertEqual((item.collected, item.due, item.state), (D('0'), D('0'), STATE_PENDING))  # noqa: E501

    def test_collected_bounded_by_line_amount(self):
        Order.objects.filter(pk=self.order.pk).update(total_amount=D('900.00'), amount_paid=D('0'))  # noqa: E501
        self.assertEqual(self._item(self.a).collected, D('0'))
        Order.objects.filter(pk=self.order.pk).update(amount_paid=D('900.00'))
        self.assertEqual(self._item(self.a).collected, D('600.00'))

    def test_cancelled_order_collects_nothing(self):
        Order.objects.filter(pk=self.order.pk).update(status='cancelled')
        item = self._item(self.a)
        self.assertEqual((item.collected, item.due, item.state), (D('0'), D('0'), STATE_CANCELLED))  # noqa: E501
        self.assertEqual(item.order_state, services.ORDER_CANCELLED)
        self.assertEqual(self._actionable(), [])

    def test_removed_order_collects_nothing(self):
        Order.objects.filter(pk=self.order.pk).delete()
        item = self._item(self.a)
        self.assertEqual((item.collected, item.state), (D('0'), STATE_CANCELLED))
        self.assertEqual(item.order_state, services.ORDER_REMOVED)

    def test_fiche_below_nisab_owes_nothing(self):
        _update(self.calc, cash_amount=D('1000.00'))
        item = self._item(self.a)
        self.assertTrue(item.below_nisab)
        self.assertEqual((item.part, item.due, item.state), (D('0'), D('0'), STATE_NOTHING_DUE))  # noqa: E501
        self.assertEqual(self._actionable(), [])

    def test_yearly_or_live_fiche_not_followed(self):
        _update(self.calc, choices_snapshot={**CHOICES, 'receivables_mode': 'yearly'})
        self.assertEqual(followups.followup_items(self.shop, self.owner), [])
        _update(self.calc, choices_snapshot=CHOICES, reference_date=services.shop_today(self.shop))  # noqa: E501
        self.assertEqual(followups.followup_items(self.shop, self.owner), [])

    def test_cumulated_over_several_fiches(self):
        """La même commande sur deux fiches : une part par fiche, chacune au prorata (D3)."""  # noqa: E501
        older = _fiche(self.shop, self.owner, [_line('600.00', order=self.order)], day=EARLIER)  # noqa: E501
        items = followups.actionable_items(self.shop, self.owner)
        self.assertEqual(
            [(item.calculation_id, item.part, item.due) for item in items],
            [(older.pk, D('15.00'), D('7.50')), (self.calc.pk, D('15.00'), D('7.50'))],
        )

    def test_personal_line_counted_in_full_at_half_share(self):
        b = _line('400.00', scope='personal')
        _update(self.calc, receivable_items=[self.a, b], choices_snapshot={**CHOICES, 'ownership_share': '50'})  # noqa: E501
        self.calc.refresh_from_db()
        a_item, b_item = self._item(self.a), self._item(b)
        # 5 000 + 300 + 400 = 5 700 → 142,50 dont 17,50 à l'encaissement : 7,50 et 10.
        self.assertEqual(services.compute_totals(self.calc).zakat_on_collection, D('17.50'))  # noqa: E501
        self.assertEqual((a_item.part, b_item.part), (D('7.50'), D('10.00')))
        self.assertEqual((a_item.due, b_item.scope), (D('3.75'), 'personal'))

    def test_parts_sum_exactly_after_rounding(self):
        lines = [_line('133.34'), _line('133.33'), _line('133.33')]
        _update(self.calc, receivable_items=lines)
        parts = [self._item(line).part for line in lines]
        self.assertEqual(parts, [D('3.33'), D('3.34'), D('3.33')])
        self.assertEqual(sum(parts), D('10.00'))


class DoubtfulTest(FollowUpTestCase):
    """Commande douteuse (1 000) sur les fiches 2024 et 2025, 400 encaissés depuis :
    10 de zakat par année comptée."""

    def setUp(self):
        super().setUp()
        order = OrderFactory(shop=self.shop, total_amount=D('1000.00'), amount_paid=D('400.00'))  # noqa: E501
        self.d_old = _line('1000.00', order=order, doubtful=True)
        self.d_new = _line('1000.00', order=order, doubtful=True)
        self.old = _fiche(self.shop, self.owner, [self.d_old], day=EARLIER, receivables_mode='yearly')  # noqa: E501
        _update(self.calc, receivable_items=[self.a, self.b, self.d_new])

    def test_three_options_shown_without_default(self):
        item = self._item(self.d_new)
        self.assertEqual((item.calculation_id, item.line_id), (self.old.pk, self.d_old['id']))  # noqa: E501
        self.assertIsNone(item.option)
        self.assertEqual(item.state, STATE_CHOICE_NEEDED)
        self.assertEqual(item.options, {'all_years': D('20.00'), 'one_year': D('10.00'), 'new_year': D('0')})  # noqa: E501
        self.assertEqual([year.amount for year in item.years], [D('10.00'), D('10.00')])
        self.assertIn(self.d_old['id'], self._actionable())

    def test_all_years_excludes_fiche_below_nisab(self):
        _update(self.old, cash_amount=D('1000.00'))
        item = self._item(self.d_new)
        self.assertEqual((item.years[0].amount, item.years[0].excluded), (None, followups.YEAR_BELOW_NISAB))  # noqa: E501
        self.assertEqual(item.options['all_years'], D('10.00'))

    def test_one_year_on_latest_fiche_below_nisab_is_zero(self):
        _update(self.calc, cash_amount=D('1000.00'))
        item = self._item(self.d_new)
        self.assertEqual(item.options, {'all_years': D('10.00'), 'one_year': D('0'), 'new_year': D('0')})  # noqa: E501

    def test_each_option_sets_due_on_origin_line(self):
        expected = {
            'all_years': (D('20.00'), STATE_TO_PAY),
            'one_year': (D('10.00'), STATE_TO_PAY),
            'new_year': (D('0'), STATE_NOTHING_DUE),
        }
        for option, (due, state) in expected.items():
            with self.subTest(option=option):
                item = self._act('choose_option', self.d_new, option)
                self.assertEqual((item.option, item.due, item.state), (option, due, state))  # noqa: E501
        row = ZakatReceivableFollowUp.objects.get()
        self.assertEqual((row.calculation_id, str(row.line_id)), (self.old.pk, self.d_old['id']))  # noqa: E501
        self.assertEqual(AuditLog.objects.filter(action='zakat_followup_option').count(), 3)  # noqa: E501

    def test_option_refused_on_sure_receivable(self):
        with self.assertRaises(FollowUpActionError):
            self._act('choose_option', self.a, 'all_years')

    def test_manual_doubtful_lines_stay_apart(self):
        """Rien ne relie une créance saisie à la main d'une fiche à l'autre (§ 5)."""
        m_old, m_new = _line('300.00', doubtful=True), _line('300.00', doubtful=True)
        _update(self.old, receivable_items=[self.d_old, m_old])
        _update(self.calc, receivable_items=[self.d_new, m_new])
        self.assertEqual(self._item(m_old).lines, [(str(self.old.pk), m_old['id'])])
        self.assertEqual(self._item(m_new).lines, [(str(self.calc.pk), m_new['id'])])


class CollectedTest(FollowUpTestCase):
    def test_collected_counts_pro_rata(self):
        item = self._act('mark_collected', self.b, collected_on=date(2025, 6, 1), amount=D('200.00'))  # noqa: E501
        self.assertEqual((item.collected, item.collected_on), (D('200.00'), date(2025, 6, 1)))  # noqa: E501
        self.assertEqual((item.due, item.state), (D('5.00'), STATE_TO_PAY))
        self.assertEqual(AuditLog.objects.get(action='zakat_followup_collected').changes, {})  # noqa: E501

    def test_refused_on_order_line(self):
        with self.assertRaises(FollowUpActionError):
            self._act('mark_collected', self.a, collected_on=date(2025, 6, 1), amount=D('100.00'))  # noqa: E501

    def test_date_and_amount_bounds(self):
        tomorrow = services.shop_today(self.shop) + timedelta(days=1)
        cases = [
            (REFERENCE - timedelta(days=1), D('100.00')),
            (tomorrow, D('100.00')),
            (date(2025, 6, 1), D('400.01')),
        ]
        for collected_on, amount in cases:
            with self.subTest(collected_on=collected_on, amount=amount):
                with self.assertRaises(FollowUpActionError):
                    self._act('mark_collected', self.b, collected_on=collected_on, amount=amount)  # noqa: E501
        self.assertFalse(ZakatReceivableFollowUp.objects.exists())

    def test_revert_collected(self):
        self._act('mark_collected', self.b, collected_on=date(2025, 6, 1), amount=D('200.00'))  # noqa: E501
        item = self._act('revert', self.b, REVERT_COLLECTED)
        self.assertEqual((item.collected, item.collected_on, item.state), (D('0'), None, STATE_PENDING))  # noqa: E501
        with self.assertRaises(FollowUpConflictError):
            self._act('revert', self.b, REVERT_COLLECTED)


class PaidTest(FollowUpTestCase):
    def test_mark_paid_once(self):
        item = self._act('mark_paid', self.a, D('7.50'))
        self.assertEqual((item.paid, item.remaining, item.state), (D('7.50'), D('0'), STATE_PAID))  # noqa: E501
        self.assertTrue(item.can_revert_paid)
        self.assertEqual(self._actionable(), [])
        with self.assertRaises(FollowUpConflictError):
            self._act('mark_paid', self.a, D('7.50'))
        self.assertEqual(ZakatReceivableFollowUp.objects.get().paid_amount, D('7.50'))

    def test_stale_amount_refused_without_write(self):
        with self.assertRaises(FollowUpConflictError) as ctx:
            self._act('mark_paid', self.a, D('5.00'))
        self.assertEqual(ctx.exception.item.remaining, D('7.50'))
        self.assertFalse(ZakatReceivableFollowUp.objects.exists())
        self.assertFalse(AuditLog.objects.filter(action__startswith='zakat_followup').exists())  # noqa: E501

    def test_new_collection_then_revert_undoes_last_payment_only(self):
        self._act('mark_paid', self.a, D('7.50'))
        Order.objects.filter(pk=self.order.pk).update(amount_paid=D('600.00'))
        item = self._item(self.a)
        self.assertEqual((item.due, item.paid, item.remaining), (D('15.00'), D('7.50'), D('7.50')))  # noqa: E501
        self._act('mark_paid', self.a, D('7.50'))
        item = self._act('revert', self.a, REVERT_PAID)
        self.assertEqual((item.paid, item.remaining, item.state), (D('7.50'), D('7.50'), STATE_TO_PAY))  # noqa: E501
        self.assertFalse(item.can_revert_paid)
        with self.assertRaises(FollowUpConflictError):
            self._act('revert', self.a, REVERT_PAID)

    def test_amount_changed_after_payment_shows_both_without_write(self):
        """Complément 2 : versé plus que le dû recalculé → reste 0, deux montants."""
        self._act('mark_paid', self.a, D('7.50'))
        before = ZakatReceivableFollowUp.objects.get()
        _update(self.calc, receivable_items=[{**self.a, 'amount': '400.00'}, self.b])
        item = self._item(self.a)
        # Part 10 sur 400, 100 encaissés : 2,50 dus pour 7,50 versés.
        self.assertEqual((item.paid, item.due, item.remaining), (D('7.50'), D('2.50'), D('0')))  # noqa: E501
        self.assertEqual(item.state, STATE_PAID)
        after = ZakatReceivableFollowUp.objects.get()
        self.assertEqual((after.paid_amount, after.updated_at), (D('7.50'), before.updated_at))  # noqa: E501

    def test_removed_line_ignored_on_read(self):
        """Complément 1 : ligne retirée après une action → plus d'élément, sans erreur ;
        la ligne de suivi reste en base."""
        self._act('mark_paid', self.a, D('7.50'))
        _update(self.calc, receivable_items=[self.b])
        self.assertIsNone(self._item(self.a))
        self.assertTrue(ZakatReceivableFollowUp.objects.filter(line_id=self.a['id']).exists())  # noqa: E501
        with self.assertRaises(FollowUpNotFound):
            self._act('mark_paid', self.a, D('7.50'))


class IgnoreTest(FollowUpTestCase):
    def test_ignore_then_revert(self):
        self.assertEqual(self._act('ignore', self.a).state, STATE_IGNORED)
        self.assertEqual(self._actionable(), [])
        with self.assertRaises(FollowUpConflictError):
            self._act('ignore', self.a)
        self.assertEqual(self._act('revert', self.a, REVERT_IGNORE).state, STATE_TO_PAY)
        with self.assertRaises(FollowUpConflictError):
            self._act('revert', self.a, REVERT_IGNORE)

    def test_journal_without_amounts(self):
        self._act('mark_paid', self.a, D('7.50'))
        self._act('revert', self.a, REVERT_PAID)
        self._act('ignore', self.a)
        logs = AuditLog.objects.filter(model_name='ZakatReceivableFollowUp')
        self.assertEqual(
            sorted(logs.values_list('action', flat=True)),
            ['zakat_followup_ignored', 'zakat_followup_paid', 'zakat_followup_reverted'],  # noqa: E501
        )
        label = f'Zakat {services.hawl_label("hijri", self.calc.hawl_year)}'
        for log in logs:
            self.assertEqual((log.changes, log.object_repr), ({}, label))


class IsolationTest(FollowUpTestCase):
    def test_other_admin_sees_nothing_and_cannot_act(self):
        other = _member(self.shop, 'other@example.com')
        self.assertEqual(followups.followup_items(self.shop, other), [])
        with self.assertRaises(FollowUpNotFound):
            followups.mark_paid(self.shop, other, self.calc.pk, self.a['id'], D('7.50'))
        with self.assertRaises(FollowUpNotFound):
            followups.ignore(self.shop, other, self.calc.pk, self.a['id'])
        self.assertFalse(ZakatReceivableFollowUp.objects.exists())

    def test_other_shop_cannot_act(self):
        shop, owner = _shop_with_owner('second@example.com')
        with self.assertRaises(FollowUpNotFound):
            followups.mark_paid(shop, owner, self.calc.pk, self.a['id'], D('7.50'))
        self.assertFalse(ZakatReceivableFollowUp.objects.exists())

    def test_unknown_line_or_live_fiche_not_found(self):
        with self.assertRaises(FollowUpNotFound):
            self._act('ignore', {'id': str(uuid.uuid4())})
        line = _line('100.00')
        live = _fiche(self.shop, self.owner, [line], day=services.shop_today(self.shop))
        with self.assertRaises(FollowUpNotFound):
            self._act('ignore', line, calc=live)
