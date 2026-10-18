'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { HawlCalendar, ZakatListRow } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import { HistoryList } from './HistoryList';
import { HistoryTable } from './HistoryTable';

interface HistoryCardProps {
  rows: ZakatListRow[];
  calendar: HawlCalendar;
  format: ZakatFormat;
}

/** Un calcul par année de hawl, du plus récent au plus ancien (gabarit liste, § 9). */
export function HistoryCard({ rows, calendar, format }: HistoryCardProps) {
  const t = useTranslations('zakat.home');
  return (
    <SectionCard title={t('history_title')} description={t('history_hint', { calendar })}>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground lg:px-5">{t('history_empty')}</p>
      ) : (
        <>
          <HistoryTable rows={rows} format={format} />
          <HistoryList rows={rows} format={format} />
        </>
      )}
    </SectionCard>
  );
}
