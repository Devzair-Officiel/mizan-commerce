"""Migrations de données du lot Z1 (0007 → 0012), rejouées depuis l'état 0006.

Chaque test repart de la 0006, insère des lignes avec les modèles historiques, puis
migre jusqu'à la 0012 ; `tearDown` ramène la base à la dernière migration.
"""
import datetime
from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

BEFORE = [('zakat', '0006_zakatcalculation_unique_finalized_zakat_per_shop_year')]
AFTER = [('zakat', '0012_calculation_personal_constraints')]


def _executor() -> MigrationExecutor:
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    return executor


def _state_apps(executor: MigrationExecutor, zakat_target: list[tuple[str, str]]):
    """Modèles historiques : zakat à la migration visée, les autres apps à jour."""
    others = [node for node in executor.loader.graph.leaf_nodes() if node[0] != 'zakat']
    return executor.loader.project_state(others + zakat_target).apps


class ZakatZ1MigrationTest(TransactionTestCase):
    serialized_rollback = True

    def setUp(self):
        executor = _executor()
        executor.migrate(BEFORE)
        self.old = _state_apps(executor, BEFORE)
        self.n = 0

    def tearDown(self):
        executor = _executor()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def _migrate(self):
        executor = _executor()
        executor.migrate(AFTER)
        return _state_apps(executor, AFTER)

    def _user(self):
        self.n += 1
        return self.old.get_model('accounts', 'User').objects.create(
            email=f'm{self.n}@example.com', password='!',
        )

    def _shop(self, owner=None, **fields):
        self.n += 1
        shop = self.old.get_model('shops', 'Shop').objects.create(
            name=f'Boutique {self.n}', currency='EUR', **fields,
        )
        if owner is not None:
            self.old.get_model('shops', 'ShopMember').objects.create(shop=shop, user=owner, role='owner')  # noqa: E501
        return shop

    def _calc(self, shop, reference_date: datetime.date, **fields):
        return self.old.get_model('zakat', 'ZakatCalculation').objects.create(
            shop=shop, reference_date=reference_date, currency='EUR', **fields,
        )

    def test_calculations_go_to_owner_and_settings_to_profile(self):
        owner, admin = self._user(), self._user()
        shop = self._shop(
            owner, zakat_annual_date=datetime.date(2025, 3, 1),
            nisab_method='gold', nisab_unit_price=Decimal('90.00'),
        )
        self.old.get_model('shops', 'ShopMember').objects.create(shop=shop, user=admin, role='admin')  # noqa: E501
        old = self._calc(
            shop, datetime.date(2024, 3, 1), status='finalized',
            stock_value_estimated=Decimal('1500.00'),
            debts_breakdown=[
                {'category': 'supplier', 'label': 'Fournisseur', 'amount': '200.00', 'is_immediately_due': True},  # noqa: E501
                {'category': 'loan', 'label': 'Paiement échelonné', 'amount': '900.00', 'is_immediately_due': False},  # noqa: E501
            ],
        )
        draft = self._calc(shop, datetime.date(2025, 3, 1))

        new = self._migrate()
        Calc = new.get_model('zakat', 'ZakatCalculation')
        migrated = Calc.objects.get(pk=old.pk)
        self.assertEqual(migrated.user_id, owner.pk)
        self.assertEqual((migrated.hawl_calendar, migrated.hawl_year), ('gregorian', 2024))  # noqa: E501
        self.assertEqual(migrated.stock_purchase_value, Decimal('1500.00'))
        self.assertEqual(migrated.version, 1)
        self.assertEqual(
            [(d['amount'], d['amount_within_12_months']) for d in migrated.debt_items],
            [('200.00', '200.00'), ('900.00', '0')],
        )
        self.assertEqual(migrated.debts_breakdown[0]['is_immediately_due'], True)
        self.assertEqual(Calc.objects.get(pk=draft.pk).hawl_year, 2025)

        Profile = new.get_model('zakat', 'ZakatProfile')
        profile = Profile.objects.get(shop_id=shop.pk)
        self.assertEqual(profile.user_id, owner.pk)
        self.assertEqual(profile.hawl_date, datetime.date(2025, 3, 1))
        self.assertEqual((profile.nisab_method, profile.nisab_unit_price), ('gold', Decimal('90.00')))  # noqa: E501
        for name in ('calendar', 'stock_valuation', 'receivables_mode', 'debts_mode', 'nisab_price_updated_at'):  # noqa: E501
            self.assertIsNone(getattr(profile, name), name)
        self.assertEqual(new.get_model('shops', 'Shop').objects.get(pk=shop.pk).nisab_unit_price, Decimal('90.00'))  # noqa: E501

    def test_method_copied_only_with_price(self):
        dated = self._shop(self._user(), zakat_annual_date=datetime.date(2025, 9, 1), nisab_method='silver')  # noqa: E501
        untouched = self._shop(self._user(), nisab_method='silver')

        Profile = self._migrate().get_model('zakat', 'ZakatProfile')
        profile = Profile.objects.get(shop_id=dated.pk)
        self.assertIsNone(profile.nisab_method)
        self.assertEqual(profile.hawl_date, datetime.date(2025, 9, 1))
        self.assertFalse(Profile.objects.filter(shop_id=untouched.pk).exists())

    def test_two_calculations_same_year_stop_without_deleting(self):
        shop = self._shop(self._user())
        first = self._calc(shop, datetime.date(2025, 1, 10), status='finalized')
        second = self._calc(shop, datetime.date(2025, 11, 20))

        with self.assertRaises(RuntimeError) as ctx:
            self._migrate()
        message = str(ctx.exception)
        self.assertIn(str(first.pk), message)
        self.assertIn(str(second.pk), message)
        self.assertIn('aucune donnée modifiée ni supprimée', message)
        Calc = self.old.get_model('zakat', 'ZakatCalculation')
        self.assertEqual(Calc.objects.filter(shop=shop).count(), 2)
        second.delete()  # pour que tearDown puisse migrer

    def test_calculation_without_owner_stops(self):
        shop = self._shop()
        calc = self._calc(shop, datetime.date(2025, 1, 10))

        with self.assertRaises(RuntimeError) as ctx:
            self._migrate()
        self.assertIn(f'calcul {calc.pk}', str(ctx.exception))
        calc.delete()
