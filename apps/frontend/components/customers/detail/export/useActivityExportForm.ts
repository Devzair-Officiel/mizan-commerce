'use client';

import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  ACTIVITY_TYPES, activityExportUrl, useCustomerActivityExportSummary,
  type ActivityExportRange, type ActivityFilter,
} from '@/lib/hooks/useCustomers';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import { toDateInput } from '@/components/reminders/reminderDates';

export const EXPORT_PERIODS = ['all', '12m', 'custom'] as const;

/** Même jour un an plus tôt (le 29 février devient le 1er mars). */
function yearBefore(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
}

function exportSchema(t: (key: 'types_required' | 'dates_order') => string) {
  return z.object({
    types: z.array(z.enum(ACTIVITY_TYPES)).min(1, t('types_required')),
    period: z.enum(EXPORT_PERIODS),
    from: z.string(),
    to: z.string(),
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

interface ActivityExportFormOptions {
  customerId: string;
  /** Puce affichée sur la carte : seul ce type est pré-coché (tous sans puce). */
  activityFilter: ActivityFilter;
  pendingOnly: boolean;
  onDone: () => void;
}

/**
 * Formulaire de l'export : contenu, période, nombre de lignes (avant le téléchargement) et
 * téléchargement du CSV par un lien vers le proxy, dans le geste de l'utilisateur.
 */
export function useActivityExportForm({ customerId, activityFilter, pendingOnly, onDone }: ActivityExportFormOptions) {
  const t = useTranslations('customers.export');
  const locale = useLocale();
  const today = toDateInput(new Date(), useShopTimeZone());
  const form = useForm<ActivityExportValues>({
    resolver: zodResolver(exportSchema(t)),
    defaultValues: { types: activityFilter ? [activityFilter] : [...ACTIVITY_TYPES], period: '12m', from: '', to: '' },
  });
  const [types, period, from, to] = useWatch({ control: form.control, name: ['types', 'period', 'from', 'to'] });
  const range = useMemo(() => rangeOf({ period, from, to }, today), [period, from, to, today]);
  const validRange = !range.from || !range.to || range.from <= range.to;
  const summary = useCustomerActivityExportSummary(customerId, range, pendingOnly, validRange);
  const rows = summary.data ? types.reduce((sum, type) => sum + summary.data.counts[type], 0) : undefined;

  const submit = form.handleSubmit((values) => {
    const link = document.createElement('a');
    link.href = activityExportUrl(customerId, values.types, rangeOf(values, today), pendingOnly, locale);
    link.download = '';
    link.click();
    onDone();
  });

  return { form, period, counts: summary.data?.counts, rows, submit };
}
