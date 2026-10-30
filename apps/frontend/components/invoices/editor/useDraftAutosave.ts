'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import { registerDirtyChecker, unregisterDirtyChecker } from '@/lib/dirtyGuard';
import { DRAFT_KINDS, draftError, useSaveDraft, type DraftDocuments, type DraftKind } from '@/lib/hooks/useDocumentDrafts';
import { apiFetch } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { toPayload, type EditorValues } from './editorSchema';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
const DEBOUNCE_MS = 800;

/** Lu par les rappels (minuteur, garde de sortie) sans attendre un rendu. */
interface DraftRef { id: string | undefined; updatedAt: string | undefined; dirty: boolean; status: SaveStatus }

/**
 * Enregistrement automatique du brouillon : `schedule()` est appelé par les gestionnaires de saisie
 * (minuteur de 800 ms, jamais un `useEffect`), `flush()` enregistre tout de suite (émission, retour).
 * Le premier enregistrement crée le brouillon et remplace l'URL par celle de son éditeur.
 * Les enregistrements s'enchaînent ; un 409 `draft_conflict` (brouillon modifié ailleurs) les arrête.
 */
export function useDraftAutosave<K extends DraftKind>(
  kind: K, form: UseFormReturn<EditorValues>, initial: DraftDocuments[K] | undefined, onReload: (document: DraftDocuments[K]) => void,
) {
  const state = useDraftState(initial);
  const persist = usePersist(kind, form, state);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<string | null>>(Promise.resolve(initial?.id ?? null));
  const { ref, update } = state;

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
  }, [flush, ref, update]);

  const reload = useReload(kind, state, onReload);
  useLeaveGuard(flush, ref);
  return { id: state.id, status: state.status, savedAt: state.savedAt, schedule, flush, reload };
}

type DraftState = ReturnType<typeof useDraftState>;

/** État affiché (identifiant, statut, heure) et sa copie dans `ref` ; `saved` retient la version enregistrée. */
function useDraftState(initial: { id: string; updated_at: string } | undefined) {
  const [id, setId] = useState(initial?.id);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState(initial?.updated_at ?? null);
  const ref = useRef<DraftRef>({ id: initial?.id, updatedAt: initial?.updated_at, dirty: false, status: 'idle' });
  const update = useCallback((next: SaveStatus) => { ref.current.status = next; setStatus(next); }, []);
  const saved = useCallback((document: { id: string; updated_at: string }) => {
    ref.current.id = document.id;
    ref.current.updatedAt = document.updated_at;
    setId(document.id);
    setSavedAt(document.updated_at);
  }, []);
  return { id, status, savedAt, ref, update, saved };
}

/** Un enregistrement : rien s'il n'y a rien de nouveau, arrêt sur conflit, page du document s'il est déjà terminé. */
function usePersist(kind: DraftKind, form: UseFormReturn<EditorValues>, { ref, update, saved }: DraftState) {
  const t = useTranslations('invoices.editor');
  const router = useRouter();
  const { mutateAsync: save } = useSaveDraft(kind);
  const { route } = DRAFT_KINDS[kind];

  return useCallback(async (): Promise<string | null> => {
    const s = ref.current;
    if (s.status === 'conflict') return null;
    if (!s.dirty && s.id) return s.id;
    s.dirty = false;
    update('saving');
    try {
      const document = await save({ id: s.id, updatedAt: s.updatedAt, data: toPayload(form.getValues()) });
      // Seulement si l'éditeur est encore affiché (l'enregistrement peut finir après un retour).
      if (!s.id && window.location.pathname === `${route}/new`) window.history.replaceState(null, '', `${route}/${document.id}/edit`);
      saved(document);
      update(s.dirty ? 'pending' : 'saved');
      return document.id;
    } catch (err) {
      s.dirty = true;
      const { code } = draftError(err);
      if (code === 'not_draft' && s.id) {
        // Terminé entre-temps (autre onglet) : il n'est plus modifiable, on ouvre sa page.
        update('saved');
        router.replace(`${route}/${s.id}`);
      } else if (code === 'draft_conflict') update('conflict');
      else {
        update('error');
        notify.error(t('save_error'));
      }
      return null;
    }
  }, [form, ref, route, router, save, saved, t, update]);
}

/** Après un conflit : relit le brouillon enregistré et repart de lui (la saisie locale est abandonnée). */
function useReload<K extends DraftKind>(kind: K, { ref, update, saved }: DraftState, onReload: (document: DraftDocuments[K]) => void) {
  const t = useTranslations('invoices.editor');
  const qc = useQueryClient();
  const { api, keys } = DRAFT_KINDS[kind];

  return useCallback(async () => {
    const s = ref.current;
    if (!s.id) return;
    const path = `${api}/${s.id}/`;
    const document = await qc.fetchQuery({ queryKey: keys.detail(s.id), queryFn: () => apiFetch<DraftDocuments[K]>(path), staleTime: 0 })
      .catch(() => null);
    if (!document) { notify.error(t('save_error')); return; }
    s.dirty = false;
    saved(document);
    onReload(document);
    update('saved');
  }, [api, keys, onReload, qc, ref, saved, t, update]);
}

/**
 * Quitter par la navigation de l'app enregistre la saisie en attente au lieu de demander ;
 * la confirmation ne reste que si le dernier enregistrement a échoué. Fermer ou recharger
 * l'onglet pendant un enregistrement déclenche l'alerte du navigateur.
 */
function useLeaveGuard(flush: () => Promise<string | null>, ref: React.RefObject<DraftRef>) {
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
