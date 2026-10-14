'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/hooks/useFormat';
import type { SalesGranularity } from '@/lib/hooks/useDashboard';

/**
 * Libellés d'un point de la courbe : court sous l'axe, complet dans la bulle et le tableau.
 * Les dates sont des jours du calendrier de la boutique (« 2026-05-01 ») : formatées en UTC,
 * elles ne glissent pas d'un jour selon le fuseau du navigateur.
 */
export function useSalesLabels(granularity: SalesGranularity, lastDate: string | undefined) {
  const t = useTranslations('dashboard.sales');
  const formatDate = useFormatDate();
  const day = useCallback(
    (date: string, options: Intl.DateTimeFormatOptions) => formatDate(date, { ...options, timeZone: 'UTC' }),
    [formatDate],
  );

  const tick = useCallback((date: string) => {
    if (granularity === 'day') return date === lastDate ? t('today_short') : day(date, { weekday: 'short' });
    if (granularity === 'week') return day(date, { day: 'numeric', month: 'short' });
    return day(date, { month: 'short' });
  }, [granularity, lastDate, t, day]);

  const full = useCallback((date: string) => {
    if (granularity === 'day') return day(date, { weekday: 'long', day: 'numeric', month: 'long' });
    if (granularity === 'week') return t('week_of', { date: day(date, { day: 'numeric', month: 'long' }) });
    return day(date, { month: 'long', year: 'numeric' });
  }, [granularity, t, day]);

  return { tick, full, year: (date: string) => date.slice(0, 4) };
}
