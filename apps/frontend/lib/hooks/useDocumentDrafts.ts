import { keepPreviousData, useMutation, useQuery, useQueryClient, type Query, type QueryKey } from '@tanstack/react-query';
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

/** Document renvoyé par les endpoints de brouillon, selon son type. */
export interface DraftDocuments {
  invoice: Invoice;
}
export type DraftKind = keyof DraftDocuments;

interface DraftKindConfig {
  /** Base des endpoints : `drafts/`, `<id>/`, `<id>/draft/`, `<id>/compliance/`, `<id>/<finalize>/`. */
  api: string;
  /** Base des pages : liste, `new`, `<id>/edit` et détail `<id>`. */
  route: string;
  /** Action qui termine le brouillon (émission d'une facture). */
  finalize: string;
  keys: { all: QueryKey; detail: (id: string) => QueryKey; compliance: (id: string) => QueryKey };
}

/** Seul endroit où la couche brouillon (éditeur, enregistrement, émission) connaît le type de document. */
export const DRAFT_KINDS: Record<DraftKind, DraftKindConfig> = {
  invoice: { api: '/invoices', route: '/invoices', finalize: 'issue', keys: qk.invoices },
};

const json = (data: unknown) => JSON.stringify(data);

/** Code d'une erreur métier (`draft_conflict`, `not_draft`, `compliance_warnings`…) et points de conformité joints. */
export function draftError(err: unknown): { code: string | null; issues: ComplianceIssue[] } {
  const data = err instanceof ApiError && typeof err.data === 'object' && err.data !== null
    ? err.data as { code?: unknown; issues?: unknown } : {};
  return { code: typeof data.code === 'string' ? data.code : null, issues: Array.isArray(data.issues) ? data.issues as ComplianceIssue[] : [] };
}

/**
 * Listes et détails, sans la vérification de conformité : le brouillon terminé ou supprimé est encore
 * affiché par l'éditeur, la relire répondrait 409 (`not_draft`) ou 404.
 */
const outsideCompliance = (kind: DraftKind) => ({
  queryKey: DRAFT_KINDS[kind].keys.all, predicate: (q: Query) => q.queryKey[2] !== 'compliance',
});

/** Création (sans identifiant) ou enregistrement concurrentiel (`updated_at` lu). */
export function useSaveDraft<K extends DraftKind>(kind: K) {
  const qc = useQueryClient();
  const { api, keys } = DRAFT_KINDS[kind];
  return useMutation({
    mutationFn: ({ id, updatedAt, data }: { id?: string; updatedAt?: string; data: DraftPayload }) => id
      ? apiFetch<DraftDocuments[K]>(`${api}/${id}/draft/`, { method: 'PATCH', body: json({ ...data, updated_at: updatedAt }) })
      : apiFetch<DraftDocuments[K]>(`${api}/drafts/`, { method: 'POST', body: json(data) }),
    onSuccess: (document) => {
      qc.setQueryData(keys.detail(document.id), document);
      qc.invalidateQueries({ queryKey: keys.compliance(document.id) });
    },
  });
}

export function useDeleteDraft(kind: DraftKind) {
  const qc = useQueryClient();
  const { api, keys } = DRAFT_KINDS[kind];
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${api}/${id}/draft/`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: keys.detail(id) });
      qc.invalidateQueries(outsideCompliance(kind));
    },
  });
}

export function complianceQueryOptions(kind: DraftKind, id: string) {
  const { api, keys } = DRAFT_KINDS[kind];
  return {
    queryKey: keys.compliance(id),
    queryFn: () => apiFetch<{ issues: ComplianceIssue[] }>(`${api}/${id}/compliance/`),
    staleTime: 0,
  };
}

export function useDraftCompliance(kind: DraftKind, id: string | undefined) {
  return useQuery({ ...complianceQueryOptions(kind, id ?? ''), enabled: !!id, placeholderData: keepPreviousData });
}

/** Émission : `acknowledged_warnings` = recommandations acceptées en connaissance de cause. */
export function useFinalizeDraft<K extends DraftKind>(kind: K) {
  const qc = useQueryClient();
  const { api, finalize, keys } = DRAFT_KINDS[kind];
  return useMutation({
    mutationFn: ({ id, acknowledged }: { id: string; acknowledged: string[] }) =>
      apiFetch<DraftDocuments[K]>(`${api}/${id}/${finalize}/`, { method: 'POST', body: json({ acknowledged_warnings: acknowledged }) }),
    onSuccess: (document) => {
      qc.setQueryData(keys.detail(document.id), document);
      qc.invalidateQueries(outsideCompliance(kind));
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
