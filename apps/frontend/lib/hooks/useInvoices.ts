import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk, type InvoicesListFilters } from '@/lib/query-keys';

export type InvoiceStatus = 'issued' | 'paid' | 'cancelled';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unit_price_ht: string;
  line_subtotal_ht: string;
}

export interface Invoice {
  id: string;
  order: string | null;
  customer: string | null;
  number: string;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string;
  paid_at: string | null;
  cancelled_at: string | null;
  seller_name: string;
  seller_address: string;
  seller_tax_id: string;
  seller_legal_mentions: string;
  seller_country: string;
  buyer_name: string;
  buyer_address: string;
  buyer_city: string;
  buyer_postal_code: string;
  buyer_country: string;
  buyer_email: string;
  buyer_phone: string;
  currency: string;
  tax_rate: string;
  subtotal_ht: string;
  discount_amount: string;
  shipping_amount: string;
  tax_amount: string;
  total_ttc: string;
  amount_paid: string;
  logo_url?: string | null;
  presentation?: {
    siret?: string;
    vat_number?: string;
    iban?: string;
    bic?: string;
    payment_methods?: string[];
    contacts?: { type: string; value: string }[];
    color?: string;
    activity?: string;
    vat_regime?: 'exempt' | 'applicable';
    order_number?: string;
    order_date?: string;
    show_account_summary?: boolean;
    account_summary?: {
      previous_invoices: { number: string; due: string }[];
      previous_balance: string;
      payments_received: string;
      current_invoice: string;
      total_balance: string;
    } | null;
  };
  notes: string;
  lines: InvoiceLine[];
  created_at: string;
  updated_at: string;
}

export interface IssueInvoicePayload {
  order_id: string;
  tax_rate?: string;
  payment_terms_days?: number;
  notes?: string;
}

function listParams(filters: InvoicesListFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
  return params;
}

export function useInvoices(filters: InvoicesListFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.invoices.list(filters),
    queryFn: () => apiFetch<PaginatedResponse<Invoice>>(`/invoices/?${listParams(filters)}`),
    enabled: options?.enabled,
  });
}

export function useInvoicesInfinite(filters: InvoicesListFilters, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: qk.invoices.infinite(filters),
    queryFn: ({ pageParam = 1 }) => apiFetch<PaginatedResponse<Invoice>>(`/invoices/?${listParams({ ...filters, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last, _, page) => last.next ? page + 1 : undefined,
    enabled: options?.enabled,
  });
}

export interface InvoicesSummary {
  due: { count: number; amount: string };
  issued_month: { count: number; amount: string };
  paid_month: { count: number; amount: string };
}

export interface InvoicesFacets {
  status: Record<'all' | InvoiceStatus, number>;
  payment: Record<'all' | 'due' | 'unpaid' | 'partial' | 'paid', number>;
}

export function useInvoicesSummary() {
  return useQuery({ queryKey: qk.invoices.summary, queryFn: () => apiFetch<InvoicesSummary>('/invoices/summary/') });
}

export function useInvoicesFacets(filters: InvoicesListFilters, options?: { enabled?: boolean }) {
  const params = { ...filters, ordering: undefined, page: undefined };
  return useQuery({
    queryKey: qk.invoices.facets(params),
    queryFn: () => apiFetch<InvoicesFacets>(`/invoices/facets/?${listParams(params)}`),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: qk.invoices.detail(id),
    queryFn: () => apiFetch<Invoice>(`/invoices/${id}/`),
    enabled: !!id,
  });
}

export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IssueInvoicePayload) =>
      apiFetch<Invoice>('/invoices/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: qk.invoices.all });
      if (invoice?.order) qc.invalidateQueries({ queryKey: qk.orders.detail(invoice.order) });
    },
  });
}

export function useUpdateInvoiceStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: InvoiceStatus) =>
      apiFetch<Invoice>(`/invoices/${id}/status/`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: qk.invoices.all });
      qc.invalidateQueries({ queryKey: qk.invoices.detail(id) });
      if (invoice?.order) qc.invalidateQueries({ queryKey: qk.orders.detail(invoice.order) });
    },
  });
}
