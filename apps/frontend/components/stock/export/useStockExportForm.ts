'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EXPORT_FORMATS, useExportSummary, type ExportFormat } from '@/lib/hooks/useExports';
import type { StockLevelsPageState } from '@/components/stock/levels/useStockLevelsState';

export const STOCK_EXPORT_SCOPES = ['all', 'restock'] as const;
type StockExportScope = (typeof STOCK_EXPORT_SCOPES)[number];

const exportSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  scope: z.enum(STOCK_EXPORT_SCOPES),
});

export type StockExportValues = z.infer<typeof exportSchema>;

/** Filtres de la liste qui pré-choisissent « À réapprovisionner » (négatif, rupture, faible). */
const RESTOCK_FILTERS: readonly string[] = ['negative', 'out', 'low'];

type LevelsList = Pick<StockLevelsPageState, 'state' | 'search' | 'ordering'>;

/** Paramètres de l'export : périmètre, recherche et tri de la liste, sans la langue (ajoutée à l'export). */
function stockExportQuery(scope: StockExportScope, { search, ordering }: LevelsList): string {
  const params = new URLSearchParams({ scope });
  if (search) params.set('search', search);
  params.set('ordering', ordering);
  return params.toString();
}

/**
 * Formulaire de l'export du stock : format et périmètre. Le message WhatsApp liste toujours ce qui
 * est à réapprovisionner : choisir WhatsApp impose ce périmètre, repasser au CSV ou au PDF rétablit
 * celui d'avant. Le passage au PDF proposé par l'avertissement du message garde la liste du message.
 */
export function useStockExportForm(levels: LevelsList) {
  const initialScope: StockExportScope = RESTOCK_FILTERS.includes(levels.state) ? 'restock' : 'all';
  const form = useForm<StockExportValues>({
    resolver: zodResolver(exportSchema),
    defaultValues: { format: 'csv', scope: initialScope },
  });
  const [format, scope] = useWatch({ control: form.control, name: ['format', 'scope'] });
  // Périmètre choisi avant de passer à WhatsApp ; `null` hors WhatsApp.
  const [saved, setSaved] = useState<StockExportScope | null>(null);

  function onFormatChange(next: ExportFormat, restore = true): void {
    if (next === 'whatsapp' && saved === null) {
      setSaved(form.getValues('scope'));
      form.setValue('scope', 'restock');
    } else if (next !== 'whatsapp' && saved !== null) {
      setSaved(null);
      if (restore) form.setValue('scope', saved);
    }
  }

  const registerFormat = form.register('format', { onChange: () => onFormatChange(form.getValues('format')) });
  /** Avertissement du message tronqué : la même liste, en entier. */
  function switchKeepingList(next: 'pdf' | 'csv'): void {
    onFormatChange(next, false);
    form.setValue('format', next);
  }

  const query = stockExportQuery(scope, levels);
  const summary = useExportSummary('stock', query, true);
  return { form, format, query, summary: summary.data, registerFormat, switchKeepingList };
}
