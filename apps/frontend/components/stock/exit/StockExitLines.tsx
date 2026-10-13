'use client';

import { useWatch, type UseFieldArrayReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { StockExitLineCard } from './StockExitLineCard';
import { StockExitLineRow } from './StockExitLineRow';
import type { StockExitForm, StockExitValues } from './useStockExitForm';

interface StockExitLinesProps {
  form: StockExitForm;
  lines: UseFieldArrayReturn<StockExitValues, 'lines'>;
}

/** Lignes de la sortie : tableau sur desktop, cartes sur mobile (une seule vue montée). */
export function StockExitLines({ form, lines }: StockExitLinesProps) {
  const t = useTranslations('stock.exit');
  const te = useTranslations('stock.entry');
  const isDesktop = useIsDesktop();
  const counting = useWatch({ control: form.control, name: 'reason' }) === 'adjustment';
  if (isDesktop === undefined || lines.fields.length === 0) return null;
  const props = (index: number) => ({ form, index, onRemove: () => lines.remove(index) });

  if (!isDesktop) {
    return (
      <ul className="divide-y divide-border">
        {lines.fields.map((field, index) => <StockExitLineCard key={field.id} {...props(index)} />)}
      </ul>
    );
  }
  const heads = [te('col_article_format'), te('col_stock'), t(counting ? 'col_counted' : 'col_quantity')];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-160 border-collapse text-start">
        <thead className="header-band">
          <tr>
            {heads.map((head) => <th key={head} scope="col" className="px-4.5 py-2.5 text-start text-xs font-semibold text-muted-foreground">{head}</th>)}
            {counting && <th scope="col" className="px-4.5 py-2.5 text-end text-xs font-semibold text-muted-foreground">{t('col_gap')}</th>}
            <th scope="col"><span className="sr-only">{te('col_actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.fields.map((field, index) => <StockExitLineRow key={field.id} {...props(index)} />)}
        </tbody>
      </table>
    </div>
  );
}
