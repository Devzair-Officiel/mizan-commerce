'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { computeRelativeAge } from './utils';

interface FreshIndicatorProps {
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function FreshIndicator({ updatedAt, isFetching, onRefresh }: FreshIndicatorProps) {
  const t = useTranslations('dashboard.fresh');
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  let label = '';
  if (isFetching) {
    label = t('refreshing');
  } else if (updatedAt) {
    const { unit, count } = computeRelativeAge(updatedAt);
    if (unit === 'just_now') label = t('just_now');
    else if (unit === 'minutes') label = t('minutes_ago', { count });
    else if (unit === 'hours') label = t('hours_ago', { count });
    else label = t('days_ago', { count });
  }

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-60 shrink-0"
      aria-label={t('refresh_aria')}
    >
      <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
