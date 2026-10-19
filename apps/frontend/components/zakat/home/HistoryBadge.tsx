'use client';

import { useTranslations } from 'next-intl';
import type { ZakatListRow } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import type { ZakatFormat } from '../useZakatFormat';
import { RESULT_STEP } from '../wizard/stepNav';

const BADGE = 'inline-flex h-5.5 items-center rounded-full px-2 text-[0.71875rem] font-semibold whitespace-nowrap';

/** Statut d'une fiche : « Versée le … » une fois notée, verdict si elle est complète, sinon ce qui reste à faire (ambre). */
export function HistoryBadge({ row, format }: { row: ZakatListRow; format: ZakatFormat }) {
  const t = useTranslations('zakat.status');
  if (row.paid_on) return <span className={cn(BADGE, 'bg-secondary text-secondary-foreground')}>{t('paid', { date: format.date(row.paid_on) })}</span>;
  const { status } = row.totals;
  const verdict = status === 'above_nisab' || status === 'below_nisab';
  const key = verdict && row.current_step < RESULT_STEP ? 'in_progress' : status;
  const tone = key === 'above_nisab' ? 'bg-secondary text-secondary-foreground'
    : key === 'below_nisab' ? 'bg-muted text-foreground'
    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return (
    <span className={cn(BADGE, tone)}>
      {t(key)}
    </span>
  );
}
