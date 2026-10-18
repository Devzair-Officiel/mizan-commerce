'use client';

import { type RefObject, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { useUpdateZakatProfile, type ZakatProfile, type ZakatProfileChanges } from '@/lib/hooks/useZakat';
import { useUnsavedGuard } from '../useUnsavedGuard';

/** Délai après la dernière frappe avant l'envoi ; les gestes (choix) partent tout de suite. */
const TYPING_DELAY_MS = 700;

/** Lecture par fonction : après un `await`, TypeScript croit encore la référence vide. */
function queuedIn(ref: RefObject<ZakatProfileChanges | null>): ZakatProfileChanges | null {
  return ref.current;
}

export interface ProfileAutosave {
  /** Change quand les réglages ont été rechargés (refus) : les champs locaux repartent du serveur. */
  resetKey: number;
  /** `immediate` pour un geste ; sinon envoi après une pause de frappe. */
  save: (changes: ZakatProfileChanges, immediate?: boolean) => void;
}

/**
 * Réglages enregistrés au fil de la saisie (Q1) : modifications fusionnées, un seul envoi à la fois.
 * Échec réseau : la saisie attend le prochain envoi et la personne est prévenue ; refus : rechargement.
 */
export function useProfileAutosave(): ProfileAutosave {
  const t = useTranslations('zakat');
  const qc = useQueryClient();
  const { mutateAsync } = useUpdateZakatProfile();
  const pending = useRef<ZakatProfileChanges | null>(null);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const send = useCallback(async (): Promise<void> => {
    timer.current = null;
    if (sending.current) return;
    sending.current = true;
    let changes = queuedIn(pending);
    while (changes) {
      pending.current = null;
      try {
        const profile = await mutateAsync(changes);
        // Saisies arrivées pendant l'envoi : affichées jusqu'au suivant, qui part tout de suite hors frappe.
        const queued = queuedIn(pending);
        if (queued) qc.setQueryData<ZakatProfile>(qk.zakat.profile, { ...profile, ...queued });
        changes = timer.current ? null : queued;
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          pending.current = null;
          notify.error(t('settings.rejected'));
          await qc.refetchQueries({ queryKey: qk.zakat.profile });
          setResetKey((k) => k + 1);
        } else {
          pending.current = { ...changes, ...queuedIn(pending) };
          notify.error(t('common.save_failed'));
        }
        changes = null;
      }
    }
    sending.current = false;
  }, [mutateAsync, qc, t]);

  const save = useCallback((changes: ZakatProfileChanges, immediate = false) => {
    qc.setQueryData<ZakatProfile>(qk.zakat.profile, (old) => old && { ...old, ...changes });
    pending.current = { ...pending.current, ...changes };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void send(); }, immediate ? 0 : TYPING_DELAY_MS);
  }, [qc, send]);

  useUnsavedGuard(useCallback(() => pending.current !== null || sending.current, []));

  return { resetKey, save };
}
