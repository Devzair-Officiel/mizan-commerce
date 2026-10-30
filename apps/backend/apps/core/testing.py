"""Aides de test partagées : courses entre transactions, ordonnées sans dépendre
du temps (vrais threads, une connexion PostgreSQL chacun).

À utiliser dans un `TransactionTestCase` (`serialized_rollback = True`) : chaque
thread ouvre sa propre connexion et valide ses transactions.
"""

import threading
import time
from collections.abc import Callable
from unittest import mock

from django.db import connection


def wait_until_blocked(pid: int) -> None:
    """Attend que la session `pid` soit bloquée par le verrou d'une autre."""
    with connection.cursor() as cursor:
        for _ in range(400):
            cursor.execute('SELECT cardinality(pg_blocking_pids(%s))', [pid])
            if cursor.fetchone()[0]:
                return
            time.sleep(0.025)
    raise AssertionError("La seconde opération n'a jamais attendu le verrou.")


def race_on_lock(
    pause: tuple[object, str],
    save: Callable[[], object],
    issue: Callable[[], object],
) -> dict[str, object]:
    """`save` s'arrête sur `pause` (verrous déjà tenus) ; `issue` part, et `save`
    ne repart que lorsque `issue` est bloqué par l'un de ces verrous.

    Résultats (ou exceptions) sous les clés `save` et `issue`.
    """
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
        wait_until_blocked(pids[-1])
        release.set()
        for thread in (saver, issuer):
            thread.join(timeout=20)
    return results
