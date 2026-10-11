'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';
import { cn } from '@/lib/utils';
import { StockVariantCell } from '../StockVariantCell';
import { InvoiceLinePickerSheet, type PickedVariant } from './InvoiceLinePickerSheet';
import type { StockEntryForm } from './useStockEntryForm';

interface InvoiceLineArticleProps {
  form: StockEntryForm;
  index: number;
  candidates: OcrMatchingCandidate[];
}

/** Article d'une ligne de facture : « Choisir l'article » si elle est à associer, sinon le format, modifiable. */
export function InvoiceLineArticle({ form, index, candidates }: InvoiceLineArticleProps) {
  const t = useTranslations('stock.invoice');
  const [open, setOpen] = useState(false);
  const [variant, name, packaging, readLabel] = useWatch({
    control: form.control,
    name: [`lines.${index}.variant`, `lines.${index}.name`, `lines.${index}.packaging`, `lines.${index}.readLabel`],
  });

  function associate(picked: PickedVariant) {
    const opts = { shouldDirty: true } as const;
    form.setValue(`lines.${index}.name`, picked.name, opts);
    form.setValue(`lines.${index}.packaging`, picked.packaging, opts);
    form.setValue(`lines.${index}.variant`, picked.variant, { ...opts, shouldValidate: form.formState.isSubmitted });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        aria-label={variant ? t('change_article', { label: readLabel }) : t('choose_article_for', { label: readLabel })}
        className={cn('flex w-full min-w-0 items-center gap-2 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          variant ? 'rounded-lg' : 'h-9.5 rounded-xl border border-amber-500/60 bg-background px-3 text-sm font-medium text-foreground')}>
        {variant ? <StockVariantCell productName={name} packagingName={packaging} /> : <span className="flex-1 truncate">{t('choose_article')}</span>}
        <ChevronDown size={16} aria-hidden className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <InvoiceLinePickerSheet readLabel={readLabel} candidates={candidates} onPick={associate} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
