'use client';

import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  EXPORT_FORMATS, ordersExportQuery, useOrdersExportSummary, type OrdersExportRange,
} from '@/lib/hooks/useOrderExports';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import type { OrdersListFilters } from '@/lib/query-keys';
import { toDateInput } from '@/components/reminders/reminderDates';

export const EXPORT_PERIODS = ['month', 'last_month', 'all', 'custom'] as const;

function exportSchema(dateOrder: string) {
  return z.object({
    format: z.enum(EXPORT_FORMATS),
    period: z.enum(EXPORT_PERIODS),
    from: z.string(),
    to: z.string(),
  }).refine((v) => v.period !== 'custom' || !v.from || !v.to || v.from <= v.to, {
    path: ['to'], message: dateOrder,
  });
}

export type OrdersExportValues = z.infer<ReturnType<typeof exportSchema>>;

const isoDay = (y: number, m: number, d: number): string => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/**
 * Jours de création exportés, dans le fuseau de la boutique : mois en cours (jusqu'à aujourd'hui),
 * mois dernier entier, tout, ou les dates choisies.
 */
function rangeOf({ period, from, to }: Pick<OrdersExportValues, 'period' | 'from' | 'to'>, today: string): OrdersExportRange {
  const [y = 0, m = 1] = today.split('-').map(Number);
  if (period === 'month') return { from: isoDay(y, m, 1), to: today };
  // Jour 0 du mois en cours : dernier jour du mois précédent.
  if (period === 'last_month') return { from: isoDay(y, m - 1, 1), to: isoDay(y, m, 0) };
  if (period === 'custom') return { from: from || undefined, to: to || undefined };
  return {};
}

/**
 * Formulaire de l'export des commandes : format, période (le filtre « mois en cours » de la liste
 * la pré-choisit), puis paramètres de la requête et nombre de lignes, avant l'export.
 */
export function useOrdersExportForm(filters: Omit<OrdersListFilters, 'page'>) {
  const t = useTranslations('orders.export');
  const today = toDateInput(new Date(), useShopTimeZone());
  const form = useForm<OrdersExportValues>({
    resolver: zodResolver(exportSchema(t('dates_order'))),
    defaultValues: { format: 'csv', period: filters.period === 'month' ? 'month' : 'all', from: '', to: '' },
  });
  const [format, period, from, to] = useWatch({ control: form.control, name: ['format', 'period', 'from', 'to'] });
  const range = useMemo(() => rangeOf({ period, from, to }, today), [period, from, to, today]);
  const validRange = !range.from || !range.to || range.from <= range.to;
  const query = ordersExportQuery(filters, range);
  const summary = useOrdersExportSummary(query, validRange);

  return { form, format, period, query, summary: summary.data };
}

export type OrdersExportForm = ReturnType<typeof useOrdersExportForm>;
