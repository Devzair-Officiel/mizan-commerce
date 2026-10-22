import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch, apiFetchFile } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export const EXPORT_FORMATS = ['csv', 'pdf', 'whatsapp'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Données exportées : chemin sous `/exports/` et paramètre `kind` des messages partagés. */
export type ExportKind = 'orders' | 'stock';

export interface ExportSummary {
  rows: number;
  pdf_max_rows: number;
  /** Lignes détaillées dans le message WhatsApp ; au-delà, un renvoi au PDF ou au CSV. */
  whatsapp_max_rows: number;
}

export interface WhatsAppExport {
  text: string;
  rows: number;
}

// Sous la racine de chaque domaine : invalider les commandes ou le stock rafraîchit aussi le nombre de lignes.
const SUMMARY_KEYS = { orders: qk.orders.exportSummary, stock: qk.stock.exportSummary } as const;
// Nom du PDF si l'en-tête Content-Disposition manque.
const PDF_NAMES: Record<ExportKind, string> = { orders: 'commandes.pdf', stock: 'stock.pdf' };

const withLang = (query: string, lang: string): string => (query ? `${query}&lang=${lang}` : `lang=${lang}`);

/** `query` : paramètres de l'export, sans la langue, ajoutée au moment de l'export. */
export function useExportSummary(kind: ExportKind, query: string, enabled: boolean) {
  return useQuery({
    queryKey: SUMMARY_KEYS[kind](query),
    queryFn: () => apiFetch<ExportSummary>(`/exports/${kind}/summary/?${query}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Fichier CSV, via le proxy (lien dans le geste de l'utilisateur) : le cookie de session est relayé côté serveur. */
export function exportCsvUrl(kind: ExportKind, query: string, lang: string): string {
  return `/api/proxy/exports/${kind}/csv/?${withLang(query, lang)}`;
}

/** Génère le PDF, lu par le proxy et prêt à partager ou à enregistrer (journalisé côté serveur). */
export function usePdfExport(kind: ExportKind) {
  return useMutation({
    mutationFn: ({ query, lang }: { query: string; lang: string }) =>
      apiFetchFile(`/exports/${kind}/pdf/?${withLang(query, lang)}`, PDF_NAMES[kind]),
  });
}

/** Prépare le texte du message (journalisé côté serveur) ; rien n'est envoyé. */
export function useWhatsAppExport(kind: ExportKind) {
  return useMutation({
    mutationFn: ({ query, lang }: { query: string; lang: string }) =>
      apiFetch<WhatsAppExport>(`/exports/${kind}/whatsapp/?${withLang(query, lang)}`),
  });
}

/** Code d'erreur de l'export : limite de débit, plafond du PDF ou autre. */
export function exportErrorKind(error: unknown): 'throttled' | 'pdf_limit' | 'generic' {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 429) return 'throttled';
  const code = (error.data as { code?: unknown } | null)?.code;
  return code === 'pdf_row_limit' ? 'pdf_limit' : 'generic';
}
