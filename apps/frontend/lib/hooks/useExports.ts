import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch, apiFetchFile } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export const EXPORT_FORMATS = ['csv', 'pdf', 'whatsapp'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Données exportées : paramètre `kind` des messages partagés. */
export type ExportKind = 'orders' | 'stock' | 'statement';

/**
 * Export visé : les commandes ou le stock de la boutique, ou le relevé de compte d'un client (PDF et
 * message seulement : son CSV est l'export de l'activité, téléchargé par sa propre fenêtre).
 */
export type ExportTarget = { kind: 'orders' | 'stock' } | { kind: 'statement'; customerId: string };

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

// Nom du PDF si l'en-tête Content-Disposition manque.
const PDF_NAMES: Record<ExportKind, string> = { orders: 'commandes.pdf', stock: 'stock.pdf', statement: 'releve.pdf' };

/** Chemin sous `/exports/`. */
const pathOf = (target: ExportTarget): string =>
  target.kind === 'statement' ? `customers/${target.customerId}/statement` : target.kind;

// Sous la racine de chaque domaine (le client pour le relevé) : l'invalider rafraîchit aussi le nombre de lignes.
const summaryKey = (target: ExportTarget, query: string) => target.kind === 'statement'
  ? qk.customers.statementExport(target.customerId, query)
  : target.kind === 'orders' ? qk.orders.exportSummary(query) : qk.stock.exportSummary(query);

const withLang = (query: string, lang: string): string => (query ? `${query}&lang=${lang}` : `lang=${lang}`);

/** `query` : paramètres de l'export, sans la langue, ajoutée au moment de l'export. */
export function useExportSummary(target: ExportTarget, query: string, enabled: boolean) {
  return useQuery({
    queryKey: summaryKey(target, query),
    queryFn: () => apiFetch<ExportSummary>(`/exports/${pathOf(target)}/summary/?${query}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Fichier CSV, via le proxy (lien dans le geste de l'utilisateur) : le cookie de session est relayé côté serveur. */
export function exportCsvUrl(kind: 'orders' | 'stock', query: string, lang: string): string {
  return `/api/proxy/exports/${kind}/csv/?${withLang(query, lang)}`;
}

/** Génère le PDF, lu par le proxy et prêt à partager ou à enregistrer (journalisé côté serveur). */
export function usePdfExport(target: ExportTarget) {
  return useMutation({
    mutationFn: ({ query, lang }: { query: string; lang: string }) =>
      apiFetchFile(`/exports/${pathOf(target)}/pdf/?${withLang(query, lang)}`, PDF_NAMES[target.kind]),
  });
}

/** Prépare le texte du message (journalisé côté serveur) ; rien n'est envoyé. */
export function useWhatsAppExport(target: ExportTarget) {
  return useMutation({
    mutationFn: ({ query, lang }: { query: string; lang: string }) =>
      apiFetch<WhatsAppExport>(`/exports/${pathOf(target)}/whatsapp/?${withLang(query, lang)}`),
  });
}

/** Code d'erreur de l'export : limite de débit, plafond du PDF ou autre. */
export function exportErrorKind(error: unknown): 'throttled' | 'pdf_limit' | 'generic' {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 429) return 'throttled';
  const code = (error.data as { code?: unknown } | null)?.code;
  return code === 'pdf_row_limit' ? 'pdf_limit' : 'generic';
}
