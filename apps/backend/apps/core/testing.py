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


def _runner(results: dict[str, object], pids: list[int]) -> Callable[..., None]:
    """Corps d'un thread : note son pid, range le résultat (ou l'exception)."""

    def run(name: str, action: Callable[[], object]) -> None:
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_backend_pid()')
                pids.append(cursor.fetchone()[0])
            results[name] = action()
        except BaseException as exc:  # noqa: BLE001 — on compare les issues.
            results[name] = exc
        finally:
            connection.close()

    return run


def _holder(
    pause: tuple[object, str], paused: threading.Event, release: threading.Event
) -> Callable[..., object]:
    """Seul le premier appel s'arrête ; les suivants (autre thread) passent."""
    original = getattr(*pause)

    def hold(*args, **kwargs):
        if not paused.is_set():
            paused.set()
            release.wait(timeout=20)
        return original(*args, **kwargs)

    return hold


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
    run = _runner(results, pids)

    with mock.patch.object(*pause, _holder(pause, paused, release)):
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


def run_while_paused(
    pause: tuple[object, str],
    held: Callable[[], object],
    other: Callable[[], object],
) -> dict[str, object]:
    """`held` s'arrête sur `pause` (transaction ouverte, verrous tenus) ; `other`
    s'exécute jusqu'au bout pendant ce temps, puis `held` reprend.

    Résultats sous `held` et `other` ; `other` doit avoir fini sans attendre
    `held` (sinon `AssertionError`).
    """
    paused, release = threading.Event(), threading.Event()
    results: dict[str, object] = {}
    run = _runner(results, [])
    with mock.patch.object(*pause, _holder(pause, paused, release)):
        holder = threading.Thread(target=run, args=('held', held))
        holder.start()
        try:
            assert paused.wait(timeout=20)
            runner = threading.Thread(target=run, args=('other', other))
            runner.start()
            runner.join(timeout=20)
            assert not runner.is_alive(), "L'autre opération a attendu la première."
        finally:
            release.set()
            holder.join(timeout=20)
    return results
