import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

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

export function useInvoices(status?: InvoiceStatus) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['invoices', { status: status ?? null }],
    queryFn: () => apiFetch<PaginatedResponse<Invoice>>(`/invoices/${qs ? `?${qs}` : ''}`),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoices', id],
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
      qc.invalidateQueries({ queryKey: ['invoices'] });
      if (invoice?.order) qc.invalidateQueries({ queryKey: ['orders', invoice.order] });
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
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoices', id] });
      if (invoice?.order) qc.invalidateQueries({ queryKey: ['orders', invoice.order] });
    },
  });
}

export function formatInvoiceMoney(value: string | number, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return `0,00 ${currency}`;
  return `${num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
