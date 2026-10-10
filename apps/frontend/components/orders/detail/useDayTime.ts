'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatDate, useFormatDateTime } from '@/lib/hooks/useFormat';

export interface DayTimeParts {
  when: 'today' | 'yesterday' | 'other';
  date: string;
  time: string;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Date d'un événement de la commande : « Aujourd'hui, 08:09 », « Hier, 17:40 »
 * ou « 3 oct., 10:15 ». `parts` sert aux phrases (« Créée aujourd'hui à 08:09 »).
 */
export function useDayTime() {
  const t = useTranslations('orders.detail');
  const formatDate = useFormatDate();
  const formatDateTime = useFormatDateTime();

  const parts = useCallback((iso: string): DayTimeParts => {
    const d = new Date(iso);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const when = dayKey(d) === dayKey(new Date()) ? 'today' : dayKey(d) === dayKey(yesterday) ? 'yesterday' : 'other';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return {
      when,
      date: formatDate(d, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }),
      time: formatDateTime(d, { hour: '2-digit', minute: '2-digit' }),
    };
  }, [formatDate, formatDateTime]);

  const format = useCallback((iso: string) => t('day_time', { ...parts(iso) }), [t, parts]);
  return { parts, format };
}
