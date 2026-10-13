'use client';

import { useTranslations } from 'next-intl';
import { QuickEntrySheet } from '@/components/stock/quick-entry/QuickEntrySheet';
import { ConfirmDialog } from '@/components/ui/dialog';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { ProductFormatDialog } from './ProductFormatDialog';
import type { ProductDetailState } from './useProductDetailState';

interface ProductDetailDialogsProps {
  product: ProductDetail;
  state: ProductDetailState;
  currency: string;
}

/** Fenêtres de la fiche : entrée rapide, format, confirmations de désactivation et de suppression. */
export function ProductDetailDialogs({ product, state, currency }: ProductDetailDialogsProps) {
  const t = useTranslations('articles.sheet');
  const { target, close } = state.format;
  const { kind, open, setOpen, run } = state.confirm;
  const values = { type: product.type };

  return (
    <>
      <QuickEntrySheet variant={state.entry.variant} currencyCode={currency} onClose={state.entry.close} />
      {target && (
        <ProductFormatDialog key={target === 'new' ? 'new' : target.id} product={product}
          variant={target === 'new' ? null : target} currency={currency} onClose={close} />
      )}
      <ConfirmDialog open={open} onOpenChange={setOpen} variant="destructive" onConfirm={run}
        title={t(kind === 'delete' ? 'confirm_delete_title' : 'confirm_deactivate_title', values)}
        description={t(kind === 'delete' ? 'confirm_delete_text' : 'confirm_deactivate_text', values)}
        confirmLabel={t(kind === 'delete' ? 'delete' : 'deactivate')} cancelLabel={t('cancel')} />
    </>
  );
}
