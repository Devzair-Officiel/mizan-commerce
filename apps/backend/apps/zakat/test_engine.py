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

    def _both_modes(self, **fields) -> dict[str, services.ZakatTotals]:
        # Seuil or à 10 le gramme → 850.
        return {
            mode: _totals({'receivables_mode': mode, 'nisab_unit_price': '10.00'}, **fields)  # noqa: E501
            for mode in ('yearly', 'on_collection')
        }

    def test_on_collection_debt_excess_taken_from_receivables(self):
        # 1 000 d'actifs, 3 000 de dettes, 5 000 de créances sûres : net 3 000 → 75.
        totals = self._both_modes(
            cash_amount=Decimal('1000.00'), stock_sale_value=Decimal('0'),
            receivable_items=[{'order_id': None, 'label': 'Client', 'amount': '5000.00', 'doubtful': False}],  # noqa: E501
            debt_items=[{'category': 'supplier', 'label': 'Fournisseur', 'amount': '3000.00', 'amount_within_12_months': '3000.00'}],  # noqa: E501
        )
        yearly, later = totals['yearly'], totals['on_collection']
        self.assertEqual((yearly.zakat_now, yearly.zakat_on_collection), (Decimal('75.00'), Decimal('0')))  # noqa: E501
        self.assertEqual(later.base, Decimal('0'))
        self.assertEqual(later.receivables_on_collection, Decimal('3000.00'))
        self.assertEqual((later.zakat_now, later.zakat_on_collection), (Decimal('0'), Decimal('75.00')))  # noqa: E501
        for mode in totals.values():
            self.assertEqual(mode.nisab_compared_amount, Decimal('3000.00'))
            self.assertEqual(mode.zakat_total, Decimal('75.00'))

    def test_on_collection_same_total_despite_rounding(self):
        # 1 000,10 × 2,5 % = 25,0025 → 25,00 ; net 1 000,20 × 2,5 % = 25,005 → 25,01.
        totals = self._both_modes(
            cash_amount=Decimal('1000.10'), stock_sale_value=Decimal('0'),
            receivable_items=[{'order_id': None, 'label': 'Client', 'amount': '0.10', 'doubtful': False}],  # noqa: E501
        )
        later = totals['on_collection']
        self.assertEqual((later.zakat_now, later.zakat_on_collection), (Decimal('25.00'), Decimal('0.01')))  # noqa: E501
        self.assertEqual(totals['yearly'].zakat_total, later.zakat_total)
        self.assertEqual(later.zakat_total, Decimal('25.01'))


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

    def test_nisab_ratio_for_gauge(self):
        # Au-dessus : seuil / net ; en dessous : net / seuil ; inconnu sans seuil.
        above = _totals().nisab_ratio  # 8 500 / 13 000
        below = _totals(cash_amount=Decimal('5000.00')).nisab_ratio  # 8 000 / 8 500
        unknown = _totals({'nisab_unit_price': None}).nisab_ratio
        expected = (Decimal('0.654'), Decimal('0.941'), None)
        self.assertEqual((above, below, unknown), expected)

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
            receivable_items=[{'order_id': None, 'label': 'Sûre', 'amount': '600.00', 'doubtful': False, 'scope': 'shop'}],  # noqa: E501
            other_assets=[{'category': 'gold_silver', 'label': 'Bijoux', 'amount': '2000.00', 'counted': True}],  # noqa: E501
            debt_items=[{'category': 'supplier', 'label': 'Fournisseur', 'amount': '800.00', 'amount_within_12_months': '800.00', 'scope': 'shop'}],  # noqa: E501
        )
        self.assertEqual(totals.ownership_share, Decimal('50'))
        self.assertEqual(totals.cash, Decimal('5000.00'))
        self.assertEqual(totals.stock, Decimal('2000.00'))
        self.assertEqual(totals.receivables_sure, Decimal('300.00'))
        self.assertEqual(totals.debts_total, Decimal('400.00'))
        self.assertEqual(totals.other_assets, Decimal('2000.00'))
        self.assertEqual(totals.base, Decimal('8900.00'))

    def test_personal_debt_deducted_in_full_at_half_share(self):
        """Lot Z4 : part de 50 %, dette personnelle de 1 000 € → 1 000 € déduits."""
        totals = _totals(
            {'ownership_share': '50'},
            debt_items=[{'category': 'other', 'label': 'Prêt familial', 'amount': '1000.00', 'amount_within_12_months': '1000.00', 'scope': 'personal'}],  # noqa: E501
        )
        self.assertEqual(totals.debts_total, Decimal('1000.00'))
        self.assertEqual(totals.debts_total_personal, Decimal('1000.00'))
        self.assertEqual(totals.debts_deducted, Decimal('1000.00'))
        # (10 000 + 3 000) × 50 % − 1 000 = 5 500.
        self.assertEqual(totals.base, Decimal('5500.00'))

    def test_share_only_on_shop_lines(self):
        totals = _totals(
            {'ownership_share': '50', 'debts_mode': 'within_12_months'},
            receivable_items=[
                {'order_id': None, 'label': 'Boutique', 'amount': '600.00', 'doubtful': False, 'scope': 'shop'},  # noqa: E501
                {'order_id': None, 'label': 'Prêt à un ami', 'amount': '400.00', 'doubtful': False, 'scope': 'personal'},  # noqa: E501
            ],
            debt_items=[
                {'category': 'supplier', 'label': 'Fournisseur', 'amount': '800.00', 'amount_within_12_months': '200.00', 'scope': 'shop'},  # noqa: E501
                {'category': 'other', 'label': 'Famille', 'amount': '500.00', 'amount_within_12_months': '300.00', 'scope': 'personal'},  # noqa: E501
            ],
        )
        self.assertEqual((totals.receivables_sure, totals.receivables_sure_personal), (Decimal('700.00'), Decimal('400.00')))  # noqa: E501
        self.assertEqual((totals.debts_total, totals.debts_total_personal), (Decimal('900.00'), Decimal('500.00')))  # noqa: E501
        self.assertEqual(
            (totals.debts_within_12_months, totals.debts_within_12_months_personal),
            (Decimal('400.00'), Decimal('300.00')),
        )
        # 6 500 + 700 − 400 = 6 800.
        self.assertEqual(totals.base, Decimal('6800.00'))


UNCHOSEN = {
    'receivable_items': [
        {'id': 'r1', 'order_id': None, 'label': 'Client', 'amount': '600.00', 'doubtful': False, 'scope': None},  # noqa: E501
        {'id': 'r2', 'order_id': 'o1', 'label': 'Commande', 'amount': '200.00', 'doubtful': False, 'scope': None},  # noqa: E501
    ],
    'debt_items': [
        {'id': 'd1', 'category': 'supplier', 'label': 'Fournisseur', 'amount': '1000.00', 'amount_within_12_months': '1000.00', 'scope': None},  # noqa: E501
    ],
}


class UnchosenScopeTest(SimpleTestCase):
    """Portée jamais choisie (`null`) : « boutique » à 100 %, à préciser en dessous."""

    def test_full_share_counts_unchosen_lines_as_shop(self):
        totals = _totals(**UNCHOSEN)
        self.assertEqual(totals.status, services.TOTALS_ABOVE_NISAB)
        self.assertEqual(totals.missing_scopes, {})
        self.assertEqual((totals.receivables_sure, totals.debts_deducted), (Decimal('800.00'), Decimal('1000.00')))  # noqa: E501
        self.assertEqual(totals.debt_deducted, {'d1': Decimal('1000.00')})
        # 13 000 + 800 − 1 000 = 12 800.
        self.assertEqual(totals.base, Decimal('12800.00'))

    def test_lower_share_waits_for_scope(self):
        totals = _totals({'ownership_share': '50'}, **UNCHOSEN)
        self.assertEqual(totals.status, services.TOTALS_CHOICE_MISSING)
        self.assertEqual(totals.missing_choices, ())
        # La commande est de la boutique : rien à préciser pour elle.
        self.assertEqual(totals.missing_scopes, {'receivables': ['r1'], 'debts': ['d1']})  # noqa: E501
        for name in ('receivables_sure', 'debts_total', 'debts_deducted', 'base', 'nisab_compared_amount', 'zakat_now', 'zakat_total'):  # noqa: E501
            self.assertIsNone(getattr(totals, name), name)
        self.assertEqual(totals.debt_deducted, {'d1': None})
        self.assertTrue(all(v is None for v in totals.option_effects['debts_mode'].values()))  # noqa: E501

    def test_scope_chosen_unblocks(self):
        items = {
            'receivable_items': [{**UNCHOSEN['receivable_items'][0], 'scope': 'shop'}, UNCHOSEN['receivable_items'][1]],  # noqa: E501
            'debt_items': [{**UNCHOSEN['debt_items'][0], 'scope': 'personal'}],
        }
        totals = _totals({'ownership_share': '50'}, **items)
        self.assertEqual(totals.status, services.TOTALS_BELOW_NISAB)
        self.assertEqual(totals.missing_scopes, {})
        self.assertEqual(totals.debt_deducted, {'d1': Decimal('1000.00')})
        # 6 500 + (600 + 200) × 50 % − 1 000 = 5 900, sous le seuil de 8 500.
        self.assertEqual(totals.base, Decimal('5900.00'))


class DebtDeductedTest(SimpleTestCase):
    """Montant déduit par dette, fourni par le serveur : leur somme vaut le total."""
    DEBTS = [
        {'id': 'a', 'category': 'supplier', 'label': 'A', 'amount': '333.33', 'amount_within_12_months': '111.11', 'scope': 'shop'},  # noqa: E501
        {'id': 'b', 'category': 'supplier', 'label': 'B', 'amount': '0.05', 'amount_within_12_months': '0.03', 'scope': 'shop'},  # noqa: E501
        {'id': 'c', 'category': 'other', 'label': 'C', 'amount': '500.00', 'amount_within_12_months': '250.00', 'scope': 'personal'},  # noqa: E501
    ]

    def test_sum_of_lines_equals_total(self):
        for mode in ('all', 'within_12_months', 'none'):
            with self.subTest(mode=mode):
                totals = _totals({'ownership_share': '33.33', 'debts_mode': mode}, debt_items=self.DEBTS)  # noqa: E501
                self.assertEqual(sum(totals.debt_deducted.values()), totals.debts_deducted)  # noqa: E501

    def test_share_on_shop_lines_full_amount_on_personal(self):
        totals = _totals({'ownership_share': '50', 'debts_mode': 'within_12_months'}, debt_items=self.DEBTS)  # noqa: E501
        self.assertEqual(totals.debt_deducted, {'a': Decimal('55.56'), 'b': Decimal('0.02'), 'c': Decimal('250.00')})  # noqa: E501

    def test_unknown_without_debts_choice(self):
        totals = _totals({'debts_mode': None}, debt_items=self.DEBTS)
        self.assertEqual(totals.debt_deducted, {'a': None, 'b': None, 'c': None})


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
