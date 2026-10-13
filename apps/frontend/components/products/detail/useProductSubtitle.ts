'use client';

import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/hooks/useFormat';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { activeFormats } from './productFormats';

/** « Article, 3 formats, créé le 12 sept. 2026 » ; le nombre de formats seulement s'il y en a plusieurs. */
export function useProductSubtitle(product: ProductDetail): string {
  const t = useTranslations('articles.sheet');
  const formatDate = useFormatDate();
  const date = formatDate(product.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const formats = activeFormats(product).length;
  return product.type === 'product' && formats > 1
    ? t('subtitle_formats', { count: formats, date })
    : t('subtitle', { type: product.type, date });
}
