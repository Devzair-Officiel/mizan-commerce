'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { ProductFormatsList } from './ProductFormatsList';
import { ProductFormatsTable } from './ProductFormatsTable';
import { sortedFormats } from './productFormats';
import { useFormatLabels } from './useFormatLabels';
import { useFormatMenu } from './useFormatMenu';
import type { ProductDetailActions } from './useProductDetailState';

interface ProductFormatsCardProps {
  product: ProductDetail;
  currency: string;
  actions: ProductDetailActions;
}

/** Carte « Formats » : prix, stock, seuil et état de chaque format ; ajout et modification en fenêtre, menu « ⋯ » par format. */
export function ProductFormatsCard({ product, currency, actions }: ProductFormatsCardProps) {
  const t = useTranslations('articles.sheet');
  const labels = useFormatLabels(product, currency);
  const formats = sortedFormats(product);
  const { menuFor, confirm } = useFormatMenu(product, actions.openFormat);
  const props = { formats, labels, actions, canEnter: product.is_active, menuFor };
  const add = (
    <button type="button" onClick={() => actions.openFormat('new')}
      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none">
      <Plus size={14} aria-hidden />{t('add_format')}
    </button>
  );

  return (
    <SectionCard title={t('formats_title')} rightSlot={add}>
      {formats.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{t('formats_empty')}</p>
      ) : (
        <>
          <ProductFormatsTable {...props} />
          <ProductFormatsList {...props} />
        </>
      )}
      <ConfirmDialog open={confirm.open} onOpenChange={confirm.setOpen} variant="destructive" onConfirm={confirm.run}
        title={t('format.confirm_delete_title', { name: confirm.variant ? labels.full(confirm.variant) : '' })}
        description={t('format.confirm_delete_text')} confirmLabel={t('delete')} cancelLabel={t('cancel')} />
    </SectionCard>
  );
}
