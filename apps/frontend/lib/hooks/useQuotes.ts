import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { InvoiceLine, OperationCategory } from './useInvoices';

/** `sent` à l'envoi ; `accepted` / `declined` (réponse du client), `expired` (tâche quotidienne), `invoiced` (conversion). */
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'invoiced';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Devis (URS-111) : mêmes lignes et totaux qu'une facture, validité au lieu de l'échéance. */
export interface Quote {
  id: string;
  customer: string | null;
  /** Facture créée depuis le devis (conversion) ; `null` avant. */
  invoice: string | null;
  /** `devis-…`, vide pour un brouillon. */
  number: string;
  status: QuoteStatus;
  operation_category: OperationCategory;
  /** Durée de validité (1 à 365 jours) ; `valid_until` = date d'envoi + cette durée. */
  validity_days: number;
  valid_until: string | null;
  payment_terms_days: number | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string;
  declined_at: string | null;
  seller_name: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  currency: string;
  tax_rate: string;
  subtotal_ht: string;
  discount_amount: string;
  shipping_amount: string;
  tax_amount: string;
  total_ttc: string;
  notes: string;
  lines: InvoiceLine[];
  created_at: string;
  updated_at: string;
}

export const QUOTES_PAGE_SIZE = 20;

const listPath = (page: number) => `/quotes/?page=${page}&page_size=${QUOTES_PAGE_SIZE}`;

/** Devis de la boutique, brouillons puis envoyés les plus récents d'abord (ordre du serveur). */
export function useQuotes(page: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.quotes.list(page),
    queryFn: () => apiFetch<PaginatedResponse<Quote>>(listPath(page)),
    enabled: options?.enabled,
  });
}

export function useQuotesInfinite(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: qk.quotes.infinite,
    queryFn: ({ pageParam = 1 }) => apiFetch<PaginatedResponse<Quote>>(listPath(pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last, _, page) => last.next ? page + 1 : undefined,
    enabled: options?.enabled,
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: qk.quotes.detail(id),
    queryFn: () => apiFetch<Quote>(`/quotes/${id}/`),
    enabled: !!id,
  });
}
