'use client';

import { useTranslations } from 'next-intl';
import { isDefaultVariant } from '@/lib/products';

interface StockVariantCellProps {
  productName: string;
  packagingName: string;
}

/** Article et format sur deux lignes ; le format par défaut se lit « Format unique ». */
export function StockVariantCell({ productName, packagingName }: StockVariantCellProps) {
  const t = useTranslations('stock.common');
  return (
    <span className="block min-w-0">
      <span dir="auto" className="block truncate text-sm font-semibold">{productName}</span>
      <span dir="auto" className="mt-0.5 block truncate text-[0.8125rem] text-muted-foreground">
        {isDefaultVariant(packagingName) ? t('single_format') : packagingName}
      </span>
    </span>
  );
}
