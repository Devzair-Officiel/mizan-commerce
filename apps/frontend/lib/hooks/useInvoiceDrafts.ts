import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { Invoice, OperationCategory } from './useInvoices';

/** Ligne envoyée au brouillon : montants en chaînes décimales (« 40.50 »). */
export interface DraftLinePayload {
  description: string;
  details: string;
  unit: string;
  quantity: string;
  unit_price_ht: string;
}

/** Brouillon complet : `lines` remplace toutes les lignes enregistrées. */
export interface DraftPayload {
  customer: string | null;
  operation_category: OperationCategory;
  payment_terms_days: number | null;
  discount_amount: string;
  shipping_amount: string;
  notes: string;
  lines: DraftLinePayload[];
}

/** Point de la vérification avant émission ; `target` : ce qu'il faut compléter. */
export interface ComplianceIssue {
  code: string;
  level: 'blocking' | 'recommended';
  target: 'lines' | 'customer' | 'invoice_settings';
}

export interface LineSuggestion {
  source: 'catalog' | 'invoice_line';
  product_id: string;
  description: string;
  details: string;
  unit: string;
  unit_price_ht: string;
  /** Facture d'où vient la ligne (source `invoice_line`). */
  invoice_number: string;
}

const json = (data: unknown) => JSON.stringify(data);

/** Code d'une erreur métier (`draft_conflict`, `not_draft`, `compliance_warnings`…) et points de conformité joints. */
export function draftError(err: unknown): { code: string | null; issues: ComplianceIssue[] } {
  const data = err instanceof ApiError && typeof err.data === 'object' && err.data !== null
    ? err.data as { code?: unknown; issues?: unknown } : {};
  return { code: typeof data.code === 'string' ? data.code : null, issues: Array.isArray(data.issues) ? data.issues as ComplianceIssue[] : [] };
}

/** Création (sans identifiant) ou enregistrement concurrentiel (`updated_at` lu). */
export function useSaveDraftInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt, data }: { id?: string; updatedAt?: string; data: DraftPayload }) => id
      ? apiFetch<Invoice>(`/invoices/${id}/draft/`, { method: 'PATCH', body: json({ ...data, updated_at: updatedAt }) })
      : apiFetch<Invoice>('/invoices/drafts/', { method: 'POST', body: json(data) }),
    onSuccess: (invoice) => {
      qc.setQueryData(qk.invoices.detail(invoice.id), invoice);
      qc.invalidateQueries({ queryKey: qk.invoices.compliance(invoice.id) });
    },
  });
}

export function useDeleteDraftInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/invoices/${id}/draft/`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: qk.invoices.detail(id) });
      qc.invalidateQueries({ queryKey: qk.invoices.all });
    },
  });
}

export function complianceQueryOptions(id: string) {
  return {
    queryKey: qk.invoices.compliance(id),
    queryFn: () => apiFetch<{ issues: ComplianceIssue[] }>(`/invoices/${id}/compliance/`),
    staleTime: 0,
  };
}

export function useInvoiceCompliance(id: string | undefined) {
  return useQuery({ ...complianceQueryOptions(id ?? ''), enabled: !!id, placeholderData: keepPreviousData });
}

/** Émission : `acknowledged_warnings` = recommandations acceptées en connaissance de cause. */
export function useIssueDraftInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acknowledged }: { id: string; acknowledged: string[] }) =>
      apiFetch<Invoice>(`/invoices/${id}/issue/`, { method: 'POST', body: json({ acknowledged_warnings: acknowledged }) }),
    onSuccess: (invoice) => {
      qc.setQueryData(qk.invoices.detail(invoice.id), invoice);
      qc.invalidateQueries({ queryKey: qk.invoices.all });
    },
  });
}

/** Catalogue puis lignes déjà facturées ; rien sous deux caractères. */
export function useLineSuggestions(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: qk.invoices.lineSuggestions(query),
    queryFn: () => apiFetch<LineSuggestion[]>(`/invoices/line-suggestions/?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Service créé depuis une ligne ; 409 `product_name_taken` si le nom existe déjà. */
export function useCreateProductFromLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; unit_label: string; unit_price_ht: string }) =>
      apiFetch<{ id: string; name: string; type: 'service' }>('/products/from-invoice-line/', { method: 'POST', body: json(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products.all });
      qc.invalidateQueries({ queryKey: ['invoices', 'line-suggestions'] });
    },
  });
}
