'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { draftError, type ComplianceIssue } from '@/lib/hooks/useDocumentDrafts';
import { useCreateCreditNote } from '@/lib/hooks/useCreditNotes';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { notify } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import type { CreditNoteForm, CreditNoteValues } from './useCreditNoteForm';

/** Refus dus à un changement de la facture depuis l'ouverture : la feuille se ferme sur la facture relue. */
const CHANGED = ['over_credit', 'nothing_to_credit', 'invoice_draft', 'invoice_cancelled', 'credit_note_of_credit_note'];

/** Un geste à la fois : un double clic ne relance pas la requête en cours. */
function useOnce() {
  const running = useRef(false);
  return useCallback(async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    try { await task(); } finally { running.current = false; }
  }, []);
}

/**
 * Clé d'idempotence de la requête : gardée tant que l'envoi est rejoué à l'identique, renouvelée
 * dès que la saisie change après un échec (la clé d'une requête refusée ne vaut pas pour une autre).
 */
function useIdempotencyKey() {
  const last = useRef<{ request: string; key: string } | null>(null);
  return useCallback((request: string) => {
    if (last.current?.request !== request) last.current = { request, key: crypto.randomUUID() };
    return last.current.key;
  }, []);
}

/**
 * Création de l'avoir. Un envoi rejoué à l'identique après une erreur réseau renvoie l'avoir déjà
 * créé au lieu d'en créer un second. `pending` reste vrai après le succès, jusqu'à la redirection.
 */
export function useCreditNoteSubmit(invoice: Invoice, { form, inputOf }: CreditNoteForm, issues: ComplianceIssue[], onClose: () => void) {
  const t = useTranslations('invoices.credit');
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateCreditNote(invoice);
  const keyFor = useIdempotencyKey();
  const once = useOnce();

  const fail = (err: unknown) => {
    const code = err instanceof ApiError ? draftError(err).code : null;
    notify.error(t('error', { code: code && [...CHANGED, 'compliance_warnings'].includes(code) ? code : 'other' }));
    if (code === 'compliance_warnings') {
      form.setValue('accepted', false);
      qc.invalidateQueries({ queryKey: [...qk.invoices.detail(invoice.id), 'credit-preview'] });
    } else if (code && CHANGED.includes(code)) {
      qc.invalidateQueries({ queryKey: qk.invoices.detail(invoice.id) });
      onClose();
    }
  };

  const send = (values: CreditNoteValues) => once(async () => {
    const input = inputOf(values);
    if (!input) return;
    if (issues.length && !values.accepted) {
      form.setError('accepted', { message: t('error', { code: 'compliance_warnings' }) });
      return;
    }
    const payload = { ...input, reason: values.reason.trim(), acknowledged_warnings: values.accepted ? issues.map((i) => i.code) : [] };
    try {
      const note = await create.mutateAsync({ payload, key: keyFor(JSON.stringify(payload)) });
      notify.success(t('done'));
      router.push(`/invoices/${note.id}`);
    } catch (err) {
      fail(err);
    }
  });

  return { submit: form.handleSubmit(send), pending: create.isPending || create.isSuccess };
}
