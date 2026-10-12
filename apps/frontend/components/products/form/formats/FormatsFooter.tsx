'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useFormatNumber } from '@/lib/hooks/useFormat';
import { amount } from '../margin';
import type { ProductFormats } from '../useProductFormats';

/** Au-delà, l'article devient illisible : la fiche reste le bon endroit pour en gérer davantage. */
const MAX_FORMATS = 50;

interface FormatsFooterProps {
  formats: ProductFormats;
  unit: string;
  mode: 'create' | 'edit';
  className?: string;
}

/** Sous le tableau : « + Ajouter un format » et le nombre de formats avec le total du stock initial. */
export function FormatsFooter({ formats, unit, mode, className = '' }: FormatsFooterProps) {
  const t = useTranslations('articles.form');
  const formatNumber = useFormatNumber();
  const total = formats.rows.reduce((sum, r) => sum + (r.id === null ? amount(r.initial_stock) ?? 0 : 0), 0);
  const count = formats.rows.length;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${className}`}>
      <button type="button" onClick={formats.add} disabled={count >= MAX_FORMATS}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3 text-[0.8125rem] font-semibold text-primary outline-none transition-colors hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-primary/30 disabled:opacity-50">
        <Plus size={15} aria-hidden />
        {t('format_add')}
      </button>
      <p className="text-[0.8125rem] text-muted-foreground" aria-live="polite">
        {mode === 'create' || total > 0
          ? t('formats_count_stock', { count, quantity: total, stock: formatNumber(total, { maximumFractionDigits: 3 }), unit })
          : t('formats_count', { count })}
      </p>
    </div>
  );
}
