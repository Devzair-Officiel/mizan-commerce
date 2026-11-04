"""Migration 0009 : `InvoiceSequence` devient `DocumentSequence` (lot 8.2).

Le test repart de la 0008, crée un compteur de facture avec le modèle historique,
puis migre dans un sens et dans l'autre ; `tearDown` ramène la base à la dernière
migration. Dans les deux sens, le prochain numéro de facture reste `last_number + 1`.
"""

from datetime import date

from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from apps.shops.models import Shop

from .services import _next_number

BEFORE = [('invoices', '0008_invoiceline_position_data')]
AFTER = [('invoices', '0009_document_sequence')]
DAY = date(2026, 10, 30)


def _executor() -> MigrationExecutor:
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    return executor


def _migrate_to(target: list[tuple[str, str]]):
    """Migre vers la cible et renvoie les modèles historiques de l'état obtenu."""
    return _executor().migrate(target).apps


def _migrate_to_latest() -> None:
    executor = _executor()
    executor.migrate(executor.loader.graph.leaf_nodes())


class DocumentSequenceMigrationTest(TransactionTestCase):
    serialized_rollback = True

    def setUp(self):
        old = _migrate_to(BEFORE)
        shop = old.get_model('shops', 'Shop').objects.create(
            name='Boutique', currency='EUR'
        )
        self.shop_id = shop.pk
        old.get_model('invoices', 'InvoiceSequence').objects.create(
            shop_id=self.shop_id, last_number=41
        )

    def tearDown(self):
        _migrate_to_latest()
        super().tearDown()

    def _next_invoice_number(self) -> str:
        _migrate_to_latest()
        with transaction.atomic():
            return _next_number(Shop.objects.get(pk=self.shop_id), 'invoice', DAY)

    def test_forward_keeps_the_invoice_counter(self):
        Sequence = _migrate_to(AFTER).get_model('invoices', 'DocumentSequence')

        rows = list(Sequence.objects.values_list('shop_id', 'kind', 'last_number'))
        self.assertEqual(rows, [(self.shop_id, 'invoice', 41)])
        self.assertEqual(self._next_invoice_number(), 'fact-301026-0042')

    def test_backward_drops_quote_and_credit_note_counters(self):
        Sequence = _migrate_to(AFTER).get_model('invoices', 'DocumentSequence')
        Sequence.objects.create(shop_id=self.shop_id, kind='quote', last_number=7)
        Sequence.objects.create(shop_id=self.shop_id, kind='credit_note', last_number=3)

        old = _migrate_to(BEFORE).get_model('invoices', 'InvoiceSequence')

        rows = list(old.objects.values_list('shop_id', 'last_number'))
        self.assertEqual(rows, [(self.shop_id, 41)])
        self.assertEqual(self._next_invoice_number(), 'fact-301026-0042')
