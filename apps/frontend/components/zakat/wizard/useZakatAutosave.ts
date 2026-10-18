'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import {
  isVersionConflict, useUpdateZakatCalculation, yearTakenOf,
  type YearTaken, type ZakatCalculation, type ZakatCalculationChanges,
} from '@/lib/hooks/useZakat';
import { useUnsavedGuard } from '../useUnsavedGuard';

export type SaveStatus = 'saved' | 'saving' | 'error';

/** Délai après la dernière frappe avant l'envoi ; les gestes (choix, interrupteur) partent tout de suite. */
const TYPING_DELAY_MS = 700;

function merge(a: ZakatCalculationChanges, b: ZakatCalculationChanges): ZakatCalculationChanges {
  return { ...a, ...b, ...(a.choices || b.choices ? { choices: { ...a.choices, ...b.choices } } : {}) };
}

/** Saisies affichées tout de suite ; les totaux restent ceux du serveur jusqu'à sa réponse. */
function apply(calc: ZakatCalculation, changes: ZakatCalculationChanges): ZakatCalculation {
  return { ...calc, ...changes, choices: { ...calc.choices, ...changes.choices } };
}

export interface ZakatAutosave {
  status: SaveStatus;
  /** Change quand la fiche a été rechargée (conflit, refus) : les champs locaux repartent du serveur. */
  resetKey: number;
  /** Année déjà prise par une autre fiche après un changement de jour J. */
  yearTaken: YearTaken | null;
  /** `immediate` pour un geste ; sinon envoi après une pause de frappe. */
  save: (changes: ZakatCalculationChanges, immediate?: boolean) => void;
  /** Envoie ce qui attend et résout `true` si tout est enregistré. */
  flush: () => Promise<boolean>;
}

/**
 * Enregistrement automatique d'une fiche (Q1) : modifications fusionnées, un seul envoi à la fois,
 * écriture conditionnelle par `version`. Conflit ou refus : la fiche est relue et la personne prévenue.
 */
export function useZakatAutosave(id: string): ZakatAutosave {
  const t = useTranslations('zakat.common');
  const qc = useQueryClient();
  const { mutateAsync } = useUpdateZakatCalculation(id);
  const pending = useRef<ZakatCalculationChanges | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [resetKey, setResetKey] = useState(0);
  const [yearTaken, setYearTaken] = useState<YearTaken | null>(null);

  const reload = useCallback(async () => {
    pending.current = null;
    await qc.refetchQueries({ queryKey: qk.zakat.detail(id) });
    setResetKey((k) => k + 1);
    setStatus('saved');
  }, [id, qc]);

  const fail = useCallback(async (error: unknown, changes: ZakatCalculationChanges) => {
    const taken = yearTakenOf(error);
    if (taken) {
      setYearTaken(taken);
      await reload();
    } else if (isVersionConflict(error)) {
      notify.error(t('conflict'));
      await reload();
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
      notify.error(t(error.status === 404 ? 'not_found' : 'rejected'));
      await reload();
    } else {
      // Réseau ou serveur : rien n'est perdu, la saisie attend un nouvel essai.
      pending.current = merge(changes, pending.current ?? {});
      setStatus('error');
      notify.error(t('save_failed'));
    }
  }, [reload, t]);

  const send = useCallback(async (): Promise<boolean> => {
    const changes = pending.current;
    const version = qc.getQueryData<ZakatCalculation>(qk.zakat.detail(id))?.version;
    if (!changes || version === undefined) return true;
    pending.current = null;
    setStatus('saving');
    try {
      const calc = await mutateAsync({ changes, version });
      if (pending.current) qc.setQueryData(qk.zakat.detail(id), apply(calc, pending.current));
      if (changes.reference_date) setYearTaken(null);
      setStatus(pending.current ? 'saving' : 'saved');
      return true;
    } catch (error) {
      await fail(error, changes);
      return false;
    }
  }, [fail, id, mutateAsync, qc]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (inflight.current) await inflight.current;
    if (!pending.current) return true;
    const request = send();
    inflight.current = request;
    const ok = await request;
    inflight.current = null;
    return ok;
  }, [send]);

  const save = useCallback((changes: ZakatCalculationChanges, immediate = false) => {
    qc.setQueryData<ZakatCalculation>(qk.zakat.detail(id), (old) => old && apply(old, changes));
    pending.current = merge(pending.current ?? {}, changes);
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, immediate ? 0 : TYPING_DELAY_MS);
  }, [flush, id, qc]);

  useUnsavedGuard(useCallback(() => pending.current !== null || inflight.current !== null, []));
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { status, resetKey, yearTaken, save, flush };
}
