'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { formatStock } from '@/lib/hooks/useProducts';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { isDefaultVariant } from '@/lib/products';
import type { ProductSummary } from '@/lib/hooks/useDashboard';

interface Props { count: number; items: ProductSummary[]; outOfStockCount: number; }

export function LowStockList({ count, items, outOfStockCount: _out }: Props) {
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
    <DashboardCard title={t('title')} rightLink={{ label: t('see_stock'), href: '/stock' }}>
      <div className="divide-y divide-border">
        {items.map((p) => {
          const isOut = parseFloat(p.stock_quantity) <= 0;
          const showVariant = !isDefaultVariant(p.variant_name);
          return (
            <div key={p.variant_id} className="flex items-center gap-3 px-5 py-3.5">
              <Link href={`/products/${p.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                {showVariant && (
                  <p className="text-[0.8125rem] text-muted-foreground truncate">{p.variant_name}</p>
                )}
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {isOut ? (
                  <span className="rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 px-2.5 py-0.5 text-xs font-semibold">
                    {t('rupture')}
                  </span>
                ) : (
                  <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {t('remaining', { qty: formatStock(p.stock_quantity, p.unit, { baseQuantity: p.base_quantity, packagingName: p.variant_name }) })}
                  </span>
                )}
                <Link
                  href={`/stock/add?product=${p.id}&variant=${p.variant_id}`}
                  className="text-[0.8125rem] font-medium text-primary hover:underline"
                >
                  {t('restock')}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      {count > items.length && (
        <Link href="/products?filter=low_stock"
          className="block text-center text-[0.8125rem] font-medium text-primary px-5 py-3.5 hover:bg-muted transition-colors border-t border-border">
          {t('see_all', { count })}
        </Link>
      )}
    </DashboardCard>
  );
}
