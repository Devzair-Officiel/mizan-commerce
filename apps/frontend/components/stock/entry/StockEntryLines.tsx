'use client';

import { useTranslations } from 'next-intl';
import type { UseFieldArrayReturn } from 'react-hook-form';
import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { StockEntryLineCard } from './StockEntryLineCard';
import { StockEntryLineRow } from './StockEntryLineRow';
import type { StockEntryForm, StockEntryValues } from './useStockEntryForm';

interface StockEntryLinesProps {
  form: StockEntryForm;
  lines: UseFieldArrayReturn<StockEntryValues, 'lines'>;
  currencyCode: string;
  /** Facture : suggestions de chaque ligne lue, par index de ligne de facture. */
  candidates?: Map<number, OcrMatchingCandidate[]>;
}

/**
 * Lignes de l'entrée : tableau sur desktop, cartes sur mobile. Une seule des deux vues est
 * montée, pour que chaque champ n'ait qu'un élément enregistré.
 */
export function StockEntryLines({ form, lines, currencyCode, candidates }: StockEntryLinesProps) {
  const t = useTranslations('stock.entry');
  const isDesktop = useIsDesktop();
  if (isDesktop === undefined || lines.fields.length === 0) return null;
  const props = (index: number) => {
    const invoiceIndex = form.getValues(`lines.${index}.invoiceIndex`);
    return {
      form, index, currencyCode, onRemove: () => lines.remove(index),
      invoice: candidates ? { candidates: (invoiceIndex !== null && candidates.get(invoiceIndex)) || [] } : null,
    };
  };

  if (!isDesktop) {
    return (
      <ul className="divide-y divide-border">
        {lines.fields.map((field, index) => <StockEntryLineCard key={field.id} {...props(index)} />)}
      </ul>
    );
  }
  const heads = candidates
    ? [t('col_article'), t('col_state'), t('col_read'), t('col_quantity'), t('col_price')]
    : [t('col_article_format'), t('col_stock'), t('col_quantity'), t('col_price')];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-205 border-collapse text-start">
        <thead className="bg-muted">
          <tr>
            {heads.map((head) => <th key={head} scope="col" className="px-4.5 py-2.5 text-start text-xs font-semibold text-muted-foreground">{head}</th>)}
            <th scope="col" className="px-4.5 py-2.5 text-end text-xs font-semibold text-muted-foreground">{t('col_total')}</th>
            <th scope="col"><span className="sr-only">{t('col_actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.fields.map((field, index) => <StockEntryLineRow key={field.id} {...props(index)} />)}
        </tbody>
      </table>
    </div>
  );
}
