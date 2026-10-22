import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch, apiFetchFile } from '@/lib/api-client';
import { qk, type OrdersListFilters } from '@/lib/query-keys';

export const EXPORT_FORMATS = ['csv', 'pdf', 'whatsapp'] as const;
export type OrdersExportFormat = (typeof EXPORT_FORMATS)[number];

/** Jours de création exportés (AAAA-MM-JJ, fuseau de la boutique) ; absents = sans limite. */
export interface OrdersExportRange {
  from?: string;
  to?: string;
}

export interface OrdersExportSummary {
  rows: number;
  pdf_max_rows: number;
  /** Commandes détaillées dans le message WhatsApp ; au-delà, un renvoi au PDF ou au CSV. */
  whatsapp_max_rows: number;
}

export interface OrdersWhatsAppExport {
  text: string;
  rows: number;
}

/**
 * Paramètres de l'export : filtres, recherche et tri de la liste (sa période « mois en cours »
 * est remplacée par `range`), sans la langue, ajoutée au moment de l'export.
 */
export function ordersExportQuery(filters: Omit<OrdersListFilters, 'page'>, range: OrdersExportRange): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.payment_status) params.set('payment_status', filters.payment_status);
  if (filters.due) params.set('due', 'true');
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.search) params.set('search', filters.search);
  if (filters.ordering) params.set('ordering', filters.ordering);
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  return params.toString();
}

const withLang = (query: string, lang: string): string => (query ? `${query}&lang=${lang}` : `lang=${lang}`);

export function useOrdersExportSummary(query: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.orders.exportSummary(query),
    queryFn: () => apiFetch<OrdersExportSummary>(`/exports/orders/summary/?${query}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Fichier CSV, via le proxy (lien dans le geste de l'utilisateur) : le cookie de session est relayé côté serveur. */
export function ordersCsvUrl(query: string, lang: string): string {
  return `/api/proxy/exports/orders/csv/?${withLang(query, lang)}`;
}

/** Génère le PDF, lu par le proxy et prêt à partager ou à enregistrer (journalisé côté serveur). */
export function useOrdersPdfExport() {
  return useMutation({
    mutationFn: ({ query, lang }: { query: string; lang: string }) =>
      apiFetchFile(`/exports/orders/pdf/?${withLang(query, lang)}`, 'commandes.pdf'),
  });
}

/** Prépare le texte du message (journalisé côté serveur) ; rien n'est envoyé. */
export function useOrdersWhatsAppExport() {
  return useMutation({
    mutationFn: ({ query, lang }: { query: string; lang: string }) =>
      apiFetch<OrdersWhatsAppExport>(`/exports/orders/whatsapp/?${withLang(query, lang)}`),
  });
}

/** Code d'erreur de l'export : limite de débit, plafond du PDF ou autre. */
export function exportErrorKind(error: unknown): 'throttled' | 'pdf_limit' | 'generic' {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 429) return 'throttled';
  const code = (error.data as { code?: unknown } | null)?.code;
  return code === 'pdf_row_limit' ? 'pdf_limit' : 'generic';
}
