'use client';

import { useTranslations } from 'next-intl';
import { compareDecimal } from '@/lib/decimal';
import type { ZakatListRow } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';

/** Sous la zakat estimée : le montant versé, quand il diffère (fiche modifiée après le versement, versement arrondi). */
export function PaidNote({ row, format }: { row: ZakatListRow; format: ZakatFormat }) {
  const t = useTranslations('zakat.home');
  const estimated = row.totals.zakat_total;
  if (!row.paid_amount || (estimated !== null && compareDecimal(estimated, row.paid_amount) === 0)) return null;
  return <span className="block text-xs font-normal text-muted-foreground">{t('history_paid', { amount: format.money(row.paid_amount) })}</span>;
}
