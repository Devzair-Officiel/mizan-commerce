'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useUpdateProductVariant, type ProductDetail, type ProductVariant } from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';
import { ProductFormatFields } from './ProductFormatFields';
import { activeFormats } from './productFormats';
import { useFormatLabels } from './useFormatLabels';
import { useProductFormatForm } from './useProductFormatForm';

interface ProductFormatDialogProps {
  product: ProductDetail;
  /** Format modifié, `null` pour un nouveau format. */
  variant: ProductVariant | null;
  currency: string;
  onClose: () => void;
}

/**
 * Ajout ou modification d'un format (Dialog sur desktop, fenêtre du bas sur mobile). Un format n'est
 * pas supprimé (ses mouvements de stock le seraient avec lui) : on le retire de la vente.
 */
export function ProductFormatDialog({ product, variant, currency, onClose }: ProductFormatDialogProps) {
  const t = useTranslations('articles.sheet.format');
  const tc = useTranslations('stock.common');
  const formId = useId();
  const labels = useFormatLabels(product, currency);
  const { form, submit, isArticle, pending } = useProductFormatForm(product, variant, onClose);
  const toggle = useUpdateProductVariant(product.id, variant?.id ?? '');
  const symbol = currency === 'EUR' ? '€' : currency;
  // Retirer de la vente le dernier format actif rendrait l'article invendable : on désactive alors l'article.
  const canToggle = variant && (!variant.is_active || activeFormats(product).length > 1);

  const setActive = (is_active: boolean) => toggle.mutate({ is_active }, {
    onSuccess: () => { notify.success(t(is_active ? 'reactivated' : 'deactivated')); onClose(); },
    onError: () => notify.error(t('save_failed')),
  });

  return (
    <BottomSheet open onClose={onClose} title={t(variant ? 'edit_title' : 'new_title', { type: product.type })}
      description={variant ? labels.full(variant) : product.name} footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canToggle && (
            <Button type="button" variant="ghost" disabled={toggle.isPending} onClick={() => setActive(!variant.is_active)}
              className="h-11 rounded-full px-4 me-auto">
              {t(variant.is_active ? 'deactivate' : 'reactivate')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4">{tc('cancel')}</Button>
          <Button type="submit" form={formId} disabled={pending} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">
            {t(variant ? 'submit_edit' : 'submit_new')}
          </Button>
        </div>
      }>
      <form id={formId} noValidate onSubmit={submit}>
        <ProductFormatFields form={form} isArticle={isArticle} creating={!variant} currency={symbol} />
      </form>
    </BottomSheet>
  );
}
