'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { sortedFormats } from './productFormats';
import { useFormatLabels } from './useFormatLabels';
import type { ProductDetailActions } from './useProductDetailState';

interface ProductPricesCardProps {
  product: ProductDetail;
  currency: string;
  actions: ProductDetailActions;
}

/** Carte « Prix » d'un service : une ligne par prestation, qui ouvre sa modification. */
export function ProductPricesCard({ product, currency, actions }: ProductPricesCardProps) {
  const t = useTranslations('articles.sheet');
  const labels = useFormatLabels(product, currency);
  const prices = sortedFormats(product);
  const add = (
    <button type="button" onClick={() => actions.openFormat('new')}
      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none">
      <Plus size={14} aria-hidden />{t('add_price')}
    </button>
  );

  return (
    <SectionCard title={t('prices_title')} rightSlot={add}>
      <ul className="divide-y divide-border">
        {prices.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => actions.openFormat(v)} aria-label={t('edit_format', { name: labels.full(v) })}
              className={cn('flex w-full items-baseline justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none lg:px-5', !v.is_active && 'text-muted-foreground')}>
              <span dir="auto" className="min-w-0 truncate text-sm">{labels.name(v)}</span>
              <span className="text-sm font-semibold tabular-nums">{labels.price(v)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
