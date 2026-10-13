'use client';

import { useTranslations } from 'next-intl';
import type { CatalogKind } from '@/lib/hooks/useMe';
import type { Product } from '@/lib/hooks/useProducts';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import { cn } from '@/lib/utils';
import { ProductPrice } from './ProductPrice';
import { ProductStock } from './ProductStock';
import { ProductThumb } from './ProductThumb';

function ProductCell({ product, sub }: { product: Product; sub: string }) {
  return (
    <span className="flex items-center gap-3">
      <ProductThumb product={product} className="size-9 text-sm" />
      <span className="min-w-0">
        <span dir="auto" className="block truncate text-sm font-semibold">{product.name}</span>
        <span className="mt-0.5 block truncate text-[0.8125rem] text-muted-foreground">{sub}</span>
      </span>
    </span>
  );
}

/** Colonnes du tableau Articles : Type seulement en boutique mixte, Stock pas en boutique de services. */
export function useProductColumns(kind: CatalogKind, currency: string): DataTableColumn<Product>[] {
  const t = useTranslations('articles.list');
  const muted = 'text-[0.8125rem] whitespace-nowrap text-muted-foreground';
  const sub = (p: Product) => (p.type === 'service' ? t('service') : t('formats', { count: p.variant_count }));

  const columns: (DataTableColumn<Product> | false)[] = [
    { key: 'name', header: t('column_name', { kind }), sortable: true, primary: true,
      cell: (p) => <ProductCell product={p} sub={sub(p)} /> },
    kind === 'both' && { key: 'type', header: t('column_type'), sortable: true,
      cell: (p) => <span className={muted}>{t('type_one', { type: p.type })}</span> },
    { key: 'min_price', header: t('column_price'), align: 'end', sortable: true,
      cell: (p) => <ProductPrice product={p} currency={currency} className="text-sm" /> },
    kind !== 'services' && { key: 'total_stock', header: t('column_stock'), align: 'end', sortable: true,
      cell: (p) => (p.type === 'service'
        ? <span className={muted} aria-label={t('none')}>—</span>
        : <ProductStock product={p} />) },
    { key: 'state', header: t('column_state'),
      cell: (p) => (
        <span className={cn(muted, 'inline-flex items-center gap-1.5')}>
          <span aria-hidden className={cn('size-2 rounded-full', p.is_active ? 'bg-green-500' : 'bg-muted-foreground/50')} />
          {t(p.is_active ? 'state_active' : 'state_inactive')}
        </span>
      ) },
  ];
  return columns.filter((c): c is DataTableColumn<Product> => !!c);
}
