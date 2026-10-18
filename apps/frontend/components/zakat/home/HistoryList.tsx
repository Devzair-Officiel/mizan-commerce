'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ZakatListRow } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import { resumeHref } from '../wizard/stepNav';
import { HistoryBadge } from './HistoryBadge';

/** Mobile : année et jour J, zakat estimée et statut ; chaque ligne ouvre sa fiche. */
export function HistoryList({ rows, format }: { rows: ZakatListRow[]; format: ZakatFormat }) {
  const t = useTranslations('zakat.home');
  return (
    <ul className="lg:hidden">
      {rows.map((row) => (
        <li key={row.id} className="border-b border-border last:border-b-0">
          <Link href={resumeHref(row.id, row.current_step)} aria-label={t('history_open', { year: String(row.hawl_year) })}
            className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 outline-none active:bg-primary/5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground tabular-nums">{row.hawl_year}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{format.date(row.reference_date)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {row.totals.zakat_total ? format.money(row.totals.zakat_total) : '—'}
              </span>
              <HistoryBadge row={row} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
