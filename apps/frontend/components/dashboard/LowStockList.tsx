'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { formatStock } from '@/lib/hooks/useProducts';
import type { ProductSummary } from '@/lib/hooks/useDashboard';

interface Props { count: number; items: ProductSummary[]; outOfStockCount: number; }

export function LowStockList({ count, items, outOfStockCount }: Props) {
  const t = useTranslations('dashboard.low_stock');

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <AlertTriangle size={20} className="text-muted-foreground" />
        </span>
        <p className="text-sm font-semibold text-foreground">{t('empty')}</p>
        <p className="text-xs text-muted-foreground">{t('empty_sub')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">{t('title')}</p>
        <span className="rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-xs font-semibold px-2 py-0.5">{count}</span>
        {outOfStockCount > 0 && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">
            {t('out_of_stock_sub', { count: outOfStockCount })}
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {items.map((p) => {
          const isOut = parseFloat(p.stock_quantity) <= 0;
          return (
            <Link key={p.variant_id} href={`/products/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted active:bg-muted transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground truncate">{p.variant_name}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${isOut ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {isOut
                  ? t('rupture')
                  : t('remaining', { qty: formatStock(p.stock_quantity, p.unit, { baseQuantity: p.base_quantity, packagingName: p.variant_name }) })}
              </span>
            </Link>
          );
        })}
      </div>
      {count > items.length && (
        <Link href="/products?filter=low_stock"
          className="block text-center text-xs font-medium text-primary px-4 py-3 hover:bg-muted transition-colors border-t border-border">
          {t('see_all', { count })}
        </Link>
      )}
    </div>
  );
}
