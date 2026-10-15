'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';
import { cn } from '@/lib/utils';
import { StockVariantCell } from '../StockVariantCell';
import { InvoiceLinePickerSheet, type PickedVariant } from './InvoiceLinePickerSheet';
import { InvoiceQuickCreateSheet } from './InvoiceQuickCreateSheet';
import type { StockEntryForm } from './useStockEntryForm';

interface InvoiceLineArticleProps {
  form: StockEntryForm;
  index: number;
  candidates: OcrMatchingCandidate[];
  currencyCode: string;
}

/**
 * Article d'une ligne de facture : « Choisir l'article » si elle est à associer, sinon le format,
 * modifiable. Une ligne à associer peut aussi créer son article ou être ignorée.
 */
export function InvoiceLineArticle({ form, index, candidates, currencyCode }: InvoiceLineArticleProps) {
  const t = useTranslations('stock.invoice');
  const [sheet, setSheet] = useState<'pick' | 'create' | null>(null);
  const [variant, name, packaging, readLabel] = useWatch({
    control: form.control,
    name: [`lines.${index}.variant`, `lines.${index}.name`, `lines.${index}.packaging`, `lines.${index}.readLabel`],
  });
  const opts = { shouldDirty: true } as const;

  function associate(picked: PickedVariant) {
    form.setValue(`lines.${index}.name`, picked.name, opts);
    form.setValue(`lines.${index}.packaging`, picked.packaging, opts);
    form.setValue(`lines.${index}.variant`, picked.variant, { ...opts, shouldValidate: form.formState.isSubmitted });
  }

  const unassociated = variant ? undefined : {
    onCreate: () => setSheet('create'),
    onIgnore: () => form.setValue(`lines.${index}.ignored`, true, opts),
  };

  return (
    <>
      <button type="button" onClick={() => setSheet('pick')} aria-haspopup="dialog"
        aria-label={variant ? t('change_article', { label: readLabel }) : t('choose_article_for', { label: readLabel })}
        className={cn('flex w-full min-w-0 items-center gap-2 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          variant ? 'rounded-lg' : 'h-9.5 rounded-xl border border-amber-500/60 bg-background px-3 text-sm font-medium text-foreground')}>
        {variant ? <StockVariantCell productName={name} packagingName={packaging} /> : <span className="flex-1 truncate">{t('choose_article')}</span>}
        <ChevronDown size={16} aria-hidden className="shrink-0 text-muted-foreground" />
      </button>
      {sheet === 'pick' && (
        <InvoiceLinePickerSheet readLabel={readLabel} candidates={candidates} onPick={associate}
          unassociated={unassociated} onClose={() => setSheet((s) => (s === 'pick' ? null : s))} />
      )}
      {sheet === 'create' && (
        <InvoiceQuickCreateSheet readLabel={readLabel} purchasePrice={form.getValues(`lines.${index}.price`)} currencyCode={currencyCode}
          onCreated={(picked) => { associate(picked); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
