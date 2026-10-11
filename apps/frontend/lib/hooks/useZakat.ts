import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

// ── Types canoniques ─────────────────────────────────────────────────────────

export type ZakatStatus = 'draft' | 'finalized';

export type DebtCategory = 'supplier' | 'tax_vat' | 'salary' | 'loan' | 'rent' | 'other';

export type ExcludedItem = 'vehicle' | 'computer' | 'machine' | 'premises' | 'furniture' | 'other';

export type StockCategory = 'finished' | 'raw_materials' | 'work_in_progress' | 'in_transit';

export type ReceivableCategory = 'certain' | 'probable' | 'doubtful';

export interface DebtItem {
  category: DebtCategory;
  label: string;
  amount: string;
  is_immediately_due: boolean;
}

export interface StockBreakdownItem {
  category: StockCategory;
  amount: string;
}

export interface ReceivableBreakdownItem {
  category: ReceivableCategory;
  amount: string;
}

export interface ZakatCalculation {
  id: string;
  status: ZakatStatus;
  current_step: number;
  reference_date: string;
  cash_amount: string;
  has_receivables: boolean;
  receivables_nominal: string;
  receivables_breakdown: ReceivableBreakdownItem[];
  receivables_amount: string;
  stock_value_estimated: string;
  stock_breakdown: StockBreakdownItem[];
  stock_value_adjusted: string | null;
  stock_value_for_base: string;
  excluded_items_acknowledged: ExcludedItem[];
  debts_breakdown: DebtItem[];
  short_term_debts: string;
  zakat_base: string;
  zakat_rate: string;
  zakat_amount: string;
  nisab_method: '' | 'gold' | 'silver';
  nisab_unit_price: string | null;
  nisab_threshold: string | null;
  is_above_nisab: boolean | null;
  currency: string;
  pdf_object_key: string;
  notes: string;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockEstimate {
  stock_value_estimated: string;
  currency: string;
  disclaimer: string;
  product_count: number;
}

/** Payload accepté par POST /zakat/calculations/ ou PATCH /zakat/calculations/<id>/. */
export type ZakatDraftPayload = Partial<
  Pick<
    ZakatCalculation,
    | 'current_step'
    | 'reference_date'
    | 'cash_amount'
    | 'has_receivables'
    | 'receivables_nominal'
    | 'receivables_breakdown'
    | 'receivables_amount'
    | 'stock_breakdown'
    | 'stock_value_adjusted'
    | 'excluded_items_acknowledged'
    | 'debts_breakdown'
    | 'notes'
  >
>;

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Catalogues UI ────────────────────────────────────────────────────────────

// Libellés sous `zakat.debt_category.*`, `zakat.stock_category.*`, `zakat.receivable_category.*`
// et `zakat.excluded_item.*` ; ces listes fixent l'ordre d'affichage.
export const DEBT_CATEGORIES: DebtCategory[] = ['supplier', 'tax_vat', 'salary', 'loan', 'rent', 'other'];

export const STOCK_CATEGORIES: StockCategory[] = ['finished', 'raw_materials', 'work_in_progress', 'in_transit'];

export const RECEIVABLE_CATEGORIES: ReceivableCategory[] = ['certain', 'probable', 'doubtful'];

export const EXCLUDED_ITEMS: ExcludedItem[] = ['vehicle', 'computer', 'machine', 'premises', 'furniture', 'other'];

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useZakatStockEstimate() {
  return useQuery({
    queryKey: qk.zakat.estimate,
    queryFn: () => apiFetch<StockEstimate>('/zakat/stock-estimate/'),
  });
}

export function useZakatCalculations(statusFilter?: ZakatStatus) {
  const qs = statusFilter ? `?status=${statusFilter}` : '';
  return useQuery({
    queryKey: qk.zakat.list(statusFilter ?? 'all'),
    queryFn: () => apiFetch<PaginatedResponse<ZakatCalculation>>(`/zakat/calculations/${qs}`),
  });
}

export function useZakatCalculation(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.zakat.detail(id),
    queryFn: () => apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/`),
    enabled: !!id,
  });
}

/** Récupère le brouillon en cours (le plus récent). Renvoie `null` si aucun. */
export function useZakatCurrentDraft() {
  return useQuery({
    queryKey: qk.zakat.draft,
    queryFn: async () => {
      const data = await apiFetch<ZakatCalculation | undefined>('/zakat/calculations/draft/');
      return data ?? null;
    },
  });
}

export function useCreateZakatDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ZakatDraftPayload) =>
      apiFetch<ZakatCalculation>('/zakat/calculations/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.zakat.all });
    },
  });
}

export function useUpdateZakatDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ZakatDraftPayload) =>
      apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.setQueryData(qk.zakat.detail(id), data);
      qc.invalidateQueries({ queryKey: qk.zakat.lists });
      qc.invalidateQueries({ queryKey: qk.zakat.draft });
    },
  });
}

export function useFinalizeZakat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/finalize/`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.zakat.all });
    },
  });
}

export function useReopenZakat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/reopen/`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.zakat.all });
    },
  });
}

export function useDeleteZakatCalculation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/zakat/calculations/${id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.zakat.all });
    },
  });
}

// ── Helpers d'affichage ──────────────────────────────────────────────────────

/** Format monétaire FR : "1 234,56 EUR". */
export function formatMoney(value: string | number, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return `0 ${currency}`;
  return `${num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/** Compte les dettes exigibles immédiatement dans une ventilation. */
export function sumImmediateDebts(debts: DebtItem[]): number {
  return debts
    .filter((d) => d.is_immediately_due)
    .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
}
