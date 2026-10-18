'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ZakatListRow } from '@/lib/hooks/useZakat';
import { NUM, TD, TH } from '../steps/tableStyles';
import type { ZakatFormat } from '../useZakatFormat';
import { resumeHref } from '../wizard/stepNav';
import { HistoryBadge } from './HistoryBadge';

/** Desktop : une ligne par fiche, entièrement cliquable (le lien de l'année couvre la ligne). */
export function HistoryTable({ rows, format }: { rows: ZakatListRow[]; format: ZakatFormat }) {
  const t = useTranslations('zakat.home');
  return (
    <table className="w-full border-collapse max-lg:hidden">
      <thead>
        <tr>
          <th scope="col" className={TH}>{t('col_year')}</th>
          <th scope="col" className={TH}>{t('col_date')}</th>
          <th scope="col" className={`${TH} text-end`}>{t('col_base')}</th>
          <th scope="col" className={`${TH} text-end`}>{t('col_zakat')}</th>
          <th scope="col" className={TH}>{t('col_status')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="group relative hover:bg-primary/5 has-focus-visible:bg-primary/5">
            <td className={TD}>
              <Link href={resumeHref(row.id, row.current_step)} aria-label={t('history_open', { year: String(row.hawl_year) })}
                className="font-semibold text-foreground tabular-nums outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-primary/30 focus-visible:after:ring-inset">
                {row.hawl_year}
              </Link>
            </td>
            <td className={`${TD} whitespace-nowrap text-muted-foreground`}>{format.date(row.reference_date)}</td>
            <td className={`${TD} ${NUM} text-muted-foreground`}>
              {row.totals.nisab_compared_amount ? format.money(row.totals.nisab_compared_amount) : '—'}
            </td>
            <td className={`${TD} ${NUM} font-semibold text-foreground`}>
              {row.totals.zakat_total ? format.money(row.totals.zakat_total) : '—'}
            </td>
            <td className={TD}><HistoryBadge row={row} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
