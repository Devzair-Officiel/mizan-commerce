'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import { registerDirtyChecker, unregisterDirtyChecker } from '@/lib/dirtyGuard';
import { draftError, useSaveDraftInvoice } from '@/lib/hooks/useInvoiceDrafts';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { apiFetch } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { toPayload, type EditorValues } from './editorSchema';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
const DEBOUNCE_MS = 800;

/**
 * Enregistrement automatique du brouillon : `schedule()` est appelé par les gestionnaires de saisie
 * (minuteur de 800 ms, jamais un `useEffect`), `flush()` enregistre tout de suite (émission, retour).
 * Le premier enregistrement crée le brouillon et remplace l'URL par celle de son éditeur.
 * Les enregistrements s'enchaînent ; un 409 `draft_conflict` (brouillon modifié ailleurs) les arrête.
 */
export function useDraftAutosave(form: UseFormReturn<EditorValues>, initial: Invoice | undefined, onReload: (invoice: Invoice) => void) {
  const t = useTranslations('invoices.editor');
  const router = useRouter();
  const qc = useQueryClient();
  const { mutateAsync: save } = useSaveDraftInvoice();
  const [id, setId] = useState(initial?.id);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState(initial?.updated_at ?? null);
  const ref = useRef({ id: initial?.id, updatedAt: initial?.updated_at, dirty: false, status: 'idle' as SaveStatus });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<string | null>>(Promise.resolve(initial?.id ?? null));

  const update = useCallback((next: SaveStatus) => { ref.current.status = next; setStatus(next); }, []);

  const persist = useCallback(async (): Promise<string | null> => {
    const s = ref.current;
    if (s.status === 'conflict') return null;
    if (!s.dirty && s.id) return s.id;
    s.dirty = false;
    update('saving');
    try {
      const invoice = await save({ id: s.id, updatedAt: s.updatedAt, data: toPayload(form.getValues()) });
      // Seulement si l'éditeur est encore affiché (l'enregistrement peut finir après un retour).
      if (!s.id && window.location.pathname === '/invoices/new') window.history.replaceState(null, '', `/invoices/${invoice.id}/edit`);
      s.id = invoice.id;
      s.updatedAt = invoice.updated_at;
      setId(invoice.id);
      setSavedAt(invoice.updated_at);
      update(s.dirty ? 'pending' : 'saved');
      return invoice.id;
    } catch (err) {
      s.dirty = true;
      const { code } = draftError(err);
      if (code === 'not_draft' && s.id) {
        // Émis entre-temps (autre onglet) : il n'est plus modifiable, on ouvre sa page.
        update('saved');
        router.replace(`/invoices/${s.id}`);
      } else if (code === 'draft_conflict') update('conflict');
      else {
        update('error');
        notify.error(t('save_error'));
      }
      return null;
    }
  }, [form, router, save, t, update]);

  const flush = useCallback((): Promise<string | null> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    chain.current = chain.current.then(persist, persist);
    return chain.current;
  }, [persist]);

  const schedule = useCallback(() => {
    ref.current.dirty = true;
    if (ref.current.status === 'conflict') return;
    if (ref.current.status !== 'saving') update('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush, update]);

  /** Après un conflit : relit le brouillon enregistré et repart de lui (la saisie locale est abandonnée). */
  const reload = useCallback(async () => {
    const s = ref.current;
    if (!s.id) return;
    const path = `/invoices/${s.id}/`;
    const invoice = await qc.fetchQuery({ queryKey: qk.invoices.detail(s.id), queryFn: () => apiFetch<Invoice>(path), staleTime: 0 })
      .catch(() => null);
    if (!invoice) { notify.error(t('save_error')); return; }
    s.updatedAt = invoice.updated_at;
    s.dirty = false;
    setSavedAt(invoice.updated_at);
    onReload(invoice);
    update('saved');
  }, [onReload, qc, t, update]);

  useLeaveGuard(flush, ref);
  return { id, status, savedAt, schedule, flush, reload };
}

/**
 * Quitter par la navigation de l'app enregistre la saisie en attente au lieu de demander ;
 * la confirmation ne reste que si le dernier enregistrement a échoué. Fermer ou recharger
 * l'onglet pendant un enregistrement déclenche l'alerte du navigateur.
 */
function useLeaveGuard(flush: () => Promise<string | null>, ref: React.RefObject<{ dirty: boolean; status: SaveStatus }>) {
  useEffect(() => {
    registerDirtyChecker(() => {
      if (ref.current.status === 'pending') void flush();
      return ref.current.status === 'error' || ref.current.status === 'conflict';
    });
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (ref.current.dirty || ref.current.status === 'saving') event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unregisterDirtyChecker();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flush, ref]);
}
