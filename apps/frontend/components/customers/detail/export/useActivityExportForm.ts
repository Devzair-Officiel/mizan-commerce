'use client';

import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  ACTIVITY_TYPES, activityExportUrl, useCustomerActivityExportSummary,
  type ActivityExportRange, type ActivityFilter,
} from '@/lib/hooks/useCustomers';
import { EXPORT_FORMATS, useExportSummary } from '@/lib/hooks/useExports';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import { toDateInput } from '@/components/reminders/reminderDates';

export const EXPORT_PERIODS = ['all', '12m', 'custom'] as const;

/** Même jour un an plus tôt (le 29 février devient le 1er mars). */
function yearBefore(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
}

// Le contenu ne se choisit que pour le CSV : le PDF et le message ont un contenu fixe.
function exportSchema(t: (key: 'types_required' | 'dates_order') => string) {
  return z.object({
    format: z.enum(EXPORT_FORMATS),
    types: z.array(z.enum(ACTIVITY_TYPES)),
    period: z.enum(EXPORT_PERIODS),
    from: z.string(),
    to: z.string(),
  }).refine((v) => v.format !== 'csv' || v.types.length > 0, {
    path: ['types'], message: t('types_required'),
  }).refine((v) => v.period !== 'custom' || !v.from || !v.to || v.from <= v.to, {
    path: ['to'], message: t('dates_order'),
  });
}

export type ActivityExportValues = z.infer<ReturnType<typeof exportSchema>>;

/** Jours exportés : tout, les 12 derniers mois (jusqu'à aujourd'hui, fuseau de la boutique) ou les dates choisies. */
function rangeOf({ period, from, to }: Pick<ActivityExportValues, 'period' | 'from' | 'to'>, today: string): ActivityExportRange {
  if (period === '12m') return { from: yearBefore(today) };
  if (period === 'custom') return { from: from || undefined, to: to || undefined };
  return {};
}

/** Paramètres du relevé (PDF, message), sans la langue, ajoutée au moment de l'export. */
function statementQuery(range: ActivityExportRange, due: boolean): string {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (due) params.set('due', 'true');
  return params.toString();
}

interface ActivityExportFormOptions {
  customerId: string;
  /** Puce affichée sur la carte : seul ce type est pré-coché (tous sans puce). */
  activityFilter: ActivityFilter;
  pendingOnly: boolean;
  onDone: () => void;
}

/**
 * Formulaire de l'export : format, contenu (CSV), période, nombre de lignes avant l'export, et
 * téléchargement du CSV par un lien vers le proxy, dans le geste de l'utilisateur. Le PDF et le
 * message (relevé de compte) passent par les actions d'export communes, avec `query`.
 * Seulement les commandes à régler (`due`) : « À encaisser » sur la carte, le message, ou le
 * passage au PDF ou au CSV que propose l'avertissement du message, qui garde sa liste.
 */
export function useActivityExportForm({ customerId, activityFilter, pendingOnly, onDone }: ActivityExportFormOptions) {
  const t = useTranslations('customers.export');
  const locale = useLocale();
  const today = toDateInput(new Date(), useShopTimeZone());
  const form = useForm<ActivityExportValues>({
    resolver: zodResolver(exportSchema(t)),
    defaultValues: { format: 'csv', types: activityFilter ? [activityFilter] : [...ACTIVITY_TYPES], period: '12m', from: '', to: '' },
  });
  const [format, types, period, from, to] = useWatch({ control: form.control, name: ['format', 'types', 'period', 'from', 'to'] });
  const [keptList, setKeptList] = useState(false);
  const due = pendingOnly || keptList || format === 'whatsapp';
  const range = useMemo(() => rangeOf({ period, from, to }, today), [period, from, to, today]);
  const validRange = !range.from || !range.to || range.from <= range.to;
  const activity = useCustomerActivityExportSummary(customerId, range, due, validRange && format === 'csv');
  const rows = activity.data ? types.reduce((sum, type) => sum + activity.data.counts[type], 0) : undefined;
  const query = statementQuery(range, due);
  const statement = useExportSummary({ kind: 'statement', customerId }, query, validRange && format !== 'csv');

  // Choisir un format dans le contrôle rend le périmètre de la carte.
  const registerFormat = form.register('format', { onChange: () => setKeptList(false) });
  function switchKeepingList(next: 'pdf' | 'csv'): void {
    setKeptList(true);
    form.setValue('format', next);
  }

  const submitCsv = form.handleSubmit((values) => {
    const link = document.createElement('a');
    link.href = activityExportUrl(customerId, values.types, rangeOf(values, today), due, locale);
    link.download = '';
    link.click();
    onDone();
  });

  return {
    form, format, period, due, keptList, counts: activity.data?.counts, rows, query, summary: statement.data,
    registerFormat, switchKeepingList, submitCsv,
  };
}
