import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ComplianceIssue } from './useDocumentDrafts';
import type { Invoice } from './useInvoices';

/** Pause de saisie avant l'aperçu : un appel par réglage posé, pas par clic de stepper. */
const PREVIEW_DELAY_MS = 250;

export type CreditNoteMode = 'total' | 'partial';

/** Ce que l'avoir crédite : tout le reste (`total`) ou des quantités ligne par ligne (`partial`). */
export interface CreditNoteInput {
  mode: CreditNoteMode;
  lines: { line: string; quantity: string }[];
  include_shipping: boolean;
}

export interface CreditNotePayload extends CreditNoteInput {
  reason: string;
  acknowledged_warnings: string[];
}

export type CreditNoteTotals = Pick<Invoice, 'subtotal_ht' | 'discount_amount' | 'shipping_amount' | 'tax_amount' | 'total_ttc'>;

/** Aperçu calculé par le serveur ; `totals` nul quand l'avoir serait refusé (`refusals`). */
export interface CreditNotePreview {
  totals: CreditNoteTotals | null;
  issues: ComplianceIssue[];
  refusals: string[];
}

/**
 * Aperçu de l'avoir après une courte pause de saisie ; `input` nul (saisie invalide) : aucun appel.
 * `settling` : un réglage attend encore son aperçu.
 */
export function useCreditNotePreview(invoiceId: string, input: CreditNoteInput | null) {
  const serialized = input ? JSON.stringify(input) : '';
  const [debounced, setDebounced] = useState(serialized);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(serialized), PREVIEW_DELAY_MS);
    return () => clearTimeout(id);
  }, [serialized]);

  const query = useQuery({
    queryKey: qk.invoices.creditPreview(invoiceId, debounced),
    queryFn: () => apiFetch<CreditNotePreview>(`/invoices/${invoiceId}/credit-notes/preview/`, { method: 'POST', body: debounced }),
    enabled: debounced !== '',
    placeholderData: keepPreviousData,
  });
  return { ...query, settling: serialized !== debounced || query.isFetching };
}

/** Tout ce que l'avoir change, sauf son aperçu (refusé dès qu'il est créé). */
const outsidePreview = { queryKey: qk.invoices.all, predicate: (q: Query) => q.queryKey[2] !== 'credit-preview' };

/**
 * Création d'un avoir. `key` (Idempotency-Key) : la même clé rejouée renvoie l'avoir déjà créé.
 * Invalide factures (liste, facettes, indicateurs, détail) et fiche du client (relevé compris).
 */
export function useCreateCreditNote(invoice: Pick<Invoice, 'id' | 'customer'>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, key }: { payload: CreditNotePayload; key: string }) =>
      apiFetch<Invoice>(`/invoices/${invoice.id}/credit-notes/`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries(outsidePreview);
      if (invoice.customer) qc.invalidateQueries({ queryKey: qk.customers.detail(invoice.customer) });
    },
  });
}
