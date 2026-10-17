"""Moteur de calcul (`services.compute_totals`) et dates du hawl : fonctions pures, sans base."""  # noqa: E501
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from . import hawl, services
from .models import ZakatCalculation

# Tous les choix faits ; seuil or à 100 le gramme → 8 500.
CHOICES = {
    'calendar': 'hijri',
    'nisab_method': 'gold',
    'nisab_unit_price': '100.00',
    'stock_valuation': 'sale',
    'receivables_mode': 'yearly',
    'debts_mode': 'all',
    'ownership_share': '100',
}


def _calc(choices: dict | None = None, **fields) -> ZakatCalculation:
    """Fiche non enregistrée : le moteur ne lit que ses champs et sa copie des choix."""
    values = {
        'cash_amount': Decimal('10000.00'),
        'stock_sale_value': Decimal('3000.00'),
        'stock_purchase_value': Decimal('2000.00'),
        'stock_extra': Decimal('0'),
        'receivable_items': [],
        'other_assets': [],
        'debt_items': [],
        **fields,
    }
    return ZakatCalculation(choices_snapshot={**CHOICES, **(choices or {})}, **values)


def _totals(choices: dict | None = None, **fields) -> services.ZakatTotals:
    return services.compute_totals(_calc(choices, **fields))


class StockValuationTest(SimpleTestCase):
    def test_sale_price_with_extra(self):
        totals = _totals(stock_extra=Decimal('500.00'))
        self.assertEqual(totals.stock, Decimal('3500.00'))
        self.assertEqual(totals.base, Decimal('13500.00'))

    def test_purchase_price_with_extra(self):
        totals = _totals({'stock_valuation': 'purchase'}, stock_extra=Decimal('500.00'))
        self.assertEqual(totals.stock, Decimal('2500.00'))
        self.assertEqual(totals.base, Decimal('12500.00'))
        self.assertEqual(totals.zakat_total, Decimal('312.50'))


class ReceivablesTest(SimpleTestCase):
    ITEMS = [
        {'order_id': None, 'label': 'Sûre', 'amount': '1000.00', 'doubtful': False},
        {'order_id': None, 'label': 'Douteuse', 'amount': '400.00', 'doubtful': True},
    ]

    def test_yearly_counts_sure_receivables_only(self):
        totals = _totals(receivable_items=self.ITEMS)
        self.assertEqual(totals.receivables_sure, Decimal('1000.00'))
        self.assertEqual(totals.receivables_doubtful, Decimal('400.00'))
        self.assertEqual(totals.receivables_in_base, Decimal('1000.00'))
        self.assertEqual(totals.receivables_on_collection, Decimal('0'))
        self.assertEqual(totals.base, Decimal('14000.00'))
        self.assertEqual(totals.zakat_now, Decimal('350.00'))
        self.assertEqual(totals.zakat_on_collection, Decimal('0.00'))

    def test_on_collection_splits_now_and_later(self):
        totals = _totals({'receivables_mode': 'on_collection'}, receivable_items=self.ITEMS)  # noqa: E501
        self.assertEqual(totals.receivables_in_base, Decimal('0'))
        self.assertEqual(totals.receivables_on_collection, Decimal('1000.00'))
        self.assertEqual(totals.base, Decimal('13000.00'))
        self.assertEqual(totals.nisab_compared_amount, Decimal('14000.00'))
        self.assertEqual(totals.zakat_now, Decimal('325.00'))
        self.assertEqual(totals.zakat_on_collection, Decimal('25.00'))
        self.assertEqual(totals.zakat_total, Decimal('350.00'))

    def test_on_collection_receivables_count_for_threshold(self):
        # Base seule 8 000 < 8 500, mais base + créances sûres 9 000 ≥ 8 500 : zakat due.  # noqa: E501
        totals = _totals(
            {'receivables_mode': 'on_collection'},
            cash_amount=Decimal('5000.00'), receivable_items=self.ITEMS,
        )
        self.assertEqual(totals.base, Decimal('8000.00'))
        self.assertEqual(totals.status, services.TOTALS_ABOVE_NISAB)
        self.assertEqual(totals.zakat_now, Decimal('200.00'))
        self.assertEqual(totals.zakat_on_collection, Decimal('25.00'))

    def test_on_collection_below_threshold_both_zero(self):
        totals = _totals(
            {'receivables_mode': 'on_collection'},
            cash_amount=Decimal('4000.00'), receivable_items=self.ITEMS,
        )
        self.assertEqual(totals.nisab_compared_amount, Decimal('8000.00'))
        self.assertEqual(totals.status, services.TOTALS_BELOW_NISAB)
        self.assertEqual(totals.zakat_now, Decimal('0'))
        self.assertEqual(totals.zakat_on_collection, Decimal('0'))


class DebtsTest(SimpleTestCase):
    ITEMS = [
        {'category': 'supplier', 'label': 'Fournisseur', 'amount': '1000.00', 'amount_within_12_months': '1000.00'},  # noqa: E501
        {'category': 'loan', 'label': 'Paiement échelonné', 'amount': '6000.00', 'amount_within_12_months': '1200.00'},  # noqa: E501
    ]

    def test_all_debts(self):
        totals = _totals({'debts_mode': 'all'}, debt_items=self.ITEMS)
        self.assertEqual(totals.debts_deducted, Decimal('7000.00'))
        self.assertEqual(totals.base, Decimal('6000.00'))

    def test_within_12_months(self):
        totals = _totals({'debts_mode': 'within_12_months'}, debt_items=self.ITEMS)
        self.assertEqual(totals.debts_deducted, Decimal('2200.00'))
        self.assertEqual(totals.base, Decimal('10800.00'))

    def test_no_debt_deducted(self):
        totals = _totals({'debts_mode': 'none'}, debt_items=self.ITEMS)
        self.assertEqual(totals.debts_deducted, Decimal('0'))
        self.assertEqual(totals.base, Decimal('13000.00'))

    def test_base_never_negative(self):
        totals = _totals(
            debt_items=[{'category': 'other', 'label': 'Dette', 'amount': '99999.00', 'amount_within_12_months': '0'}],  # noqa: E501
        )
        self.assertEqual(totals.base, Decimal('0'))
        self.assertEqual(totals.zakat_total, Decimal('0'))


class OtherAssetsTest(SimpleTestCase):
    def test_only_counted_lines(self):
        totals = _totals(other_assets=[
            {'category': 'personal_cash', 'label': 'Livret', 'amount': '2000.00', 'counted': True},  # noqa: E501
            {'category': 'real_estate', 'label': 'Résidence', 'amount': '150000.00', 'counted': False},  # noqa: E501
        ])
        self.assertEqual(totals.other_assets, Decimal('2000.00'))
        self.assertEqual(totals.base, Decimal('15000.00'))


class ThresholdTest(SimpleTestCase):
    def test_above_threshold(self):
        totals = _totals()
        self.assertEqual(totals.nisab_threshold, Decimal('8500.00'))
        self.assertEqual(totals.status, services.TOTALS_ABOVE_NISAB)
        self.assertEqual(totals.zakat_total, Decimal('325.00'))

    def test_at_threshold_is_due(self):
        totals = _totals(cash_amount=Decimal('5500.00'))
        self.assertEqual(totals.base, Decimal('8500.00'))
        self.assertEqual(totals.status, services.TOTALS_ABOVE_NISAB)
        self.assertEqual(totals.zakat_total, Decimal('212.50'))

    def test_below_threshold_nothing_due(self):
        totals = _totals(cash_amount=Decimal('5000.00'))
        self.assertEqual(totals.base, Decimal('8000.00'))
        self.assertEqual(totals.status, services.TOTALS_BELOW_NISAB)
        self.assertEqual(totals.zakat_total, Decimal('0'))

    def test_silver_threshold(self):
        totals = _totals({'nisab_method': 'silver', 'nisab_unit_price': '1.20'})
        self.assertEqual(totals.nisab_threshold, Decimal('714.00'))

    def test_unknown_threshold_still_computes_amount(self):
        totals = _totals({'nisab_unit_price': None}, cash_amount=Decimal('100.00'))
        self.assertEqual(totals.status, services.TOTALS_NISAB_UNKNOWN)
        self.assertIsNone(totals.nisab_threshold)
        self.assertEqual(totals.zakat_total, Decimal('77.50'))

    def test_unknown_threshold_without_method(self):
        totals = _totals({'nisab_method': None})
        self.assertEqual(totals.status, services.TOTALS_NISAB_UNKNOWN)


class ChoicesAndRateTest(SimpleTestCase):
    def test_missing_choices_listed(self):
        totals = _totals({'stock_valuation': None, 'debts_mode': None})
        self.assertEqual(totals.status, services.TOTALS_CHOICE_MISSING)
        self.assertEqual(totals.missing_choices, ('stock_valuation', 'debts_mode'))
        self.assertIsNone(totals.base)
        self.assertIsNone(totals.zakat_total)

    def test_missing_calendar_blocks_amount_only(self):
        totals = _totals({'calendar': None})
        self.assertEqual(totals.missing_choices, ('calendar',))
        self.assertEqual(totals.base, Decimal('13000.00'))
        self.assertIsNone(totals.rate)
        self.assertIsNone(totals.zakat_total)

    def test_empty_snapshot_lists_every_choice(self):
        totals = services.compute_totals(ZakatCalculation(choices_snapshot={}))
        self.assertEqual(totals.missing_choices, services.CHOICE_FIELDS)
        self.assertEqual(totals.ownership_share, Decimal('100'))

    def test_solar_year_rate(self):
        totals = _totals({'calendar': 'gregorian'})
        self.assertEqual(totals.rate, Decimal('0.025775'))
        self.assertEqual(totals.zakat_total, Decimal('335.08'))  # 13 000 × 2,5775 %

    def test_round_half_up_to_cent(self):
        # 100,20 × 2,5 % = 2,505 → 2,51 (et non 2,50 en arrondi bancaire).
        totals = _totals(
            {'nisab_unit_price': None},
            cash_amount=Decimal('100.20'), stock_sale_value=Decimal('0'),
        )
        self.assertEqual(totals.zakat_total, Decimal('2.51'))

    def test_option_effects(self):
        effects = _totals().option_effects
        self.assertEqual(effects['stock_valuation'], {'sale': Decimal('325.00'), 'purchase': Decimal('300.00')})  # noqa: E501
        self.assertEqual(effects['calendar']['gregorian'], Decimal('335.08'))
        # Seuil argent à 100 le gramme : 59 500 → sous le seuil.
        self.assertEqual(effects['nisab_method']['silver'], Decimal('0'))
        self.assertEqual(list(effects['debts_mode']), ['all', 'within_12_months', 'none'])  # noqa: E501


class OwnershipShareTest(SimpleTestCase):
    def test_share_applies_to_shop_amounts_not_other_assets(self):
        totals = _totals(
            {'ownership_share': '50'},
            stock_extra=Decimal('1000.00'),
            receivable_items=[{'order_id': None, 'label': 'Sûre', 'amount': '600.00', 'doubtful': False}],  # noqa: E501
            other_assets=[{'category': 'gold_silver', 'label': 'Bijoux', 'amount': '2000.00', 'counted': True}],  # noqa: E501
            debt_items=[{'category': 'supplier', 'label': 'Fournisseur', 'amount': '800.00', 'amount_within_12_months': '800.00'}],  # noqa: E501
        )
        self.assertEqual(totals.ownership_share, Decimal('50'))
        self.assertEqual(totals.cash, Decimal('5000.00'))
        self.assertEqual(totals.stock, Decimal('2000.00'))
        self.assertEqual(totals.receivables_sure, Decimal('300.00'))
        self.assertEqual(totals.debts_total, Decimal('400.00'))
        self.assertEqual(totals.other_assets, Decimal('2000.00'))
        self.assertEqual(totals.base, Decimal('8900.00'))


class HawlTest(SimpleTestCase):
    def test_hawl_year_by_calendar(self):
        self.assertEqual(hawl.hawl_year(date(2026, 2, 18), 'gregorian'), 2026)
        self.assertEqual(hawl.hawl_year(date(2026, 2, 18), 'hijri'), 1447)
        self.assertEqual(hawl.hawl_year(date(2026, 10, 17), 'hijri'), 1448)

    def test_next_gregorian_hawl_skips_feb_29(self):
        self.assertEqual(
            hawl.next_hawl_date(date(2024, 2, 29), 'gregorian', date(2026, 10, 17)),
            date(2027, 2, 28),
        )

    def test_next_hijri_hawl(self):
        # Jour J le 1er ramadan 1447 (2026-02-18) → 1er ramadan 1448.
        next_day = hawl.next_hawl_date(date(2026, 2, 18), 'hijri', date(2026, 10, 17))
        self.assertEqual(hawl.to_hijri(next_day), (1448, 9, 1))

    def test_out_of_range(self):
        with self.assertRaises(hawl.HijriRangeError):
            hawl.to_hijri(date(1900, 1, 1))
