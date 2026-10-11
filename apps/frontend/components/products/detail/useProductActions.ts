'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDownToLine, ClipboardCheck, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { activeFormats } from './productFormats';
import type { ProductDetailActions } from './useProductDetailState';

export type ProductActionKey = 'stock_in' | 'reactivate' | 'correct_stock' | 'deactivate' | 'delete';
type ProductAction = DetailAction<ProductActionKey>;

/**
 * Action principale : « Entrée de stock » pour un article actif (entrée rapide s'il n'a qu'un format,
 * entrée complète sinon), « Réactiver » pour un article inactif, rien pour un service actif.
 * Menu « ⋯ » : « Corriger le stock », « Désactiver », puis « Supprimer » si l'article n'a jamais servi.
 */
export function useProductActions(product: ProductDetail, actions: ProductDetailActions) {
  const t = useTranslations('articles.sheet');
  const router = useRouter();
  const isArticle = product.type === 'product';
  const formats = activeFormats(product);
  const [single] = formats.length === 1 ? formats : [];

  let primary: ProductAction | null = null;
  if (!product.is_active) {
    primary = { key: 'reactivate', icon: RotateCcw, label: t('reactivate'), disabled: actions.pending, onSelect: actions.reactivate };
  } else if (isArticle) {
    primary = {
      key: 'stock_in', icon: ArrowDownToLine, label: t('stock_in'),
      onSelect: () => (single ? actions.openEntry(single) : router.push('/stock/entree')),
    };
  }

  const items: ProductAction[] = [];
  if (product.is_active && isArticle && formats.length > 0) {
    items.push({
      key: 'correct_stock', icon: ClipboardCheck, label: t('correct_stock'),
      onSelect: () => router.push(single ? `/stock/sortie?variant=${single.id}&motif=correction` : '/stock/sortie?motif=correction'),
    });
  }
  if (product.is_active) {
    items.push({ key: 'deactivate', icon: PowerOff, label: t('deactivate'), disabled: actions.pending, onSelect: actions.confirmDeactivate });
  }
  const danger: ProductAction | null = product.can_delete
    ? { key: 'delete', icon: Trash2, label: t('delete'), destructive: true, disabled: actions.pending, onSelect: actions.confirmDelete }
    : null;
  const menu: DetailMenuActions<ProductActionKey> = { items, danger };
  return { primary, menu };
}
