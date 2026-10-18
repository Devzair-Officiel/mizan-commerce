"""Migration de données du lot Z3 (0004) : rappels zakat automatiques en attente.

Le test repart de la 0003, insère des rappels avec le modèle historique, puis migre
jusqu'à la 0004 ; `tearDown` ramène la base à la dernière migration.
"""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

BEFORE = [('notes', '0003_reminder_assignment_automatic')]
AFTER = [('notes', '0004_delete_pending_automatic_zakat_reminders')]


def _executor() -> MigrationExecutor:
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    return executor


def _migrate_to(target: list[tuple[str, str]]):
    """Migre vers la cible et renvoie les modèles historiques de l'état obtenu."""
    return _executor().migrate(target).apps


class NotesZ3MigrationTest(TransactionTestCase):
    serialized_rollback = True

    def setUp(self):
        self.old = _migrate_to(BEFORE)
        self.shop = self.old.get_model('shops', 'Shop').objects.create(
            name='Boutique', currency='EUR',
        )

    def tearDown(self):
        executor = _executor()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def _reminder(self, title: str, **fields):
        return self.old.get_model('notes', 'Reminder').objects.create(
            shop=self.shop, title=title, due_at=timezone.now(), **fields,
        )

    def test_deletes_only_pending_automatic_zakat_reminders(self):
        self._reminder('zakat auto en attente', category='zakat', is_automatic=True,
                       auto_key='zakat:1')
        kept = {
            self._reminder('zakat auto terminé', category='zakat', is_automatic=True,
                           status='done', auto_key='zakat:2').pk,
            self._reminder('zakat auto ignoré', category='zakat', is_automatic=True,
                           status='dismissed', auto_key='zakat:3').pk,
            self._reminder('zakat manuel', category='zakat').pk,
            self._reminder('impayé auto', category='unpaid', is_automatic=True,
                           auto_key='unpaid:1').pk,
        }

        Reminder = _migrate_to(AFTER).get_model('notes', 'Reminder')

        self.assertEqual(set(Reminder.objects.values_list('pk', flat=True)), kept)
