'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { SalesData } from '@/lib/hooks/useDashboard';
import { cn } from '@/lib/utils';
import { useSalesLabels } from './useSalesLabels';

interface SalesTableProps {
  id: string;
  data: SalesData;
  currency: string;
  /** Masqué visuellement (lecteurs d'écran) sauf quand le détail est ouvert. */
  visible: boolean;
}

/** Équivalent de la courbe en tableau : période, montant, nombre de commandes. */
export function SalesTable({ id, data, currency, visible }: SalesTableProps) {
  const t = useTranslations('dashboard.sales');
  const formatMoney = useFormatMoney();
  const labels = useSalesLabels(data.granularity, data.points.at(-1)?.date);
  const cell = 'px-3 py-1.5 text-start first-letter:uppercase';
  const num = 'px-3 py-1.5 text-end';

  // `sr-only` sur un conteneur : une table s'élargit à son contenu malgré `width: 1px`.
  return (
    <div className={visible ? 'mt-4' : 'sr-only'}>
      <table id={id} className="w-full text-[0.8125rem] tabular-nums">
        <caption className="sr-only">{t('table_caption', { period: data.period })}</caption>
        <thead className="header-band text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className={cn(cell, 'font-semibold')}>{t('table_period')}</th>
            <th scope="col" className={cn(num, 'font-semibold')}>{t('table_amount')}</th>
            <th scope="col" className={cn(num, 'font-semibold')}>{t('table_orders')}</th>
          </tr>
        </thead>
        <tbody>
          {data.points.map((p) => (
            <tr key={p.date} className="border-b border-border last:border-0">
              <th scope="row" className={cn(cell, 'font-normal text-foreground')}>{labels.full(p.date)}</th>
              <td className={cn(num, 'font-medium text-foreground')}>{formatMoney(p.revenue, currency)}</td>
              <td className={cn(num, 'text-muted-foreground')}>{p.orders_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
