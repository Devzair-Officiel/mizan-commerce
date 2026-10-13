'use client';

import { useTranslations } from 'next-intl';
import { Tag } from 'lucide-react';
import { QuickAddProductForm } from '@/components/orders/new/QuickAddProductForm';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { ProductDetail } from '@/lib/hooks/useProducts';

/**
 * Catalogue vide (panneau desktop et fenêtre d'ajout mobile) : formulaire de création
 * ouvert d'emblée, et lien vers l'article ponctuel.
 */
export function EmptyCatalogState({ onCreated, onFreeLine }: { onCreated: (p: ProductDetail) => void; onFreeLine: () => void }) {
  const t = useTranslations('orders.picker');
  const kind = useCatalogKind();
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-secondary text-primary flex items-center justify-center shrink-0">
          <Tag size={18} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-foreground">{t('empty_catalog_title')}</span>
          <span className="text-sm text-muted-foreground">{t('empty_catalog_text', { kind })}</span>
        </div>
      </div>
      <div className="mt-5">
        <QuickAddProductForm onCreated={onCreated} onClose={() => {}} />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-1.5 items-baseline text-[0.8125rem]">
        <span className="text-muted-foreground">{t('empty_catalog_free_question', { kind })}</span>
        <button type="button" onClick={onFreeLine} className="text-primary font-semibold hover:underline">
          {t('empty_catalog_free_link')}
        </button>
      </div>
    </>
  );
}
