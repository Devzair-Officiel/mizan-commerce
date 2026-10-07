'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShoppingCart } from 'lucide-react';
import { useFormatMoney, useRelativeTime } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import type { OrderToPrepare } from '@/lib/hooks/useDashboard';

interface Props {
  count: number;
  items: OrderToPrepare[];
  oldestCreatedAt: string | null;
}

export function PrepareList({ count, items, oldestCreatedAt }: Props) {
  const t = useTranslations('dashboard.prepare');
  const formatMoney = useFormatMoney();
  const relativeTime = useRelativeTime();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <ShoppingCart size={20} className="text-muted-foreground" />
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
        <span className="rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-xs font-semibold px-2 py-0.5">{count}</span>
        {oldestCreatedAt && (
          <span className="text-xs text-muted-foreground">{t('oldest_age', { age: relativeTime(oldestCreatedAt) })}</span>
        )}
      </div>
      <div className="divide-y divide-border">
        {items.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`}
            className="flex items-start gap-3 px-4 py-3 hover:bg-muted active:bg-muted transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {o.order_number}{o.customer_name ? ` · ${o.customer_name}` : ''}
              </p>
              {o.items_preview.length > 0 && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {o.items_preview.map((item) => `${item.name} ×${item.quantity}`).join(', ')}
                  {o.items_count > o.items_preview.length && ` +${o.items_count - o.items_preview.length}`}
                </p>
              )}
            </div>
            <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
              {formatMoney(o.total_amount, currency)}
            </span>
          </Link>
        ))}
      </div>
      {count > items.length && (
        <Link href="/orders?status=to_prepare"
          className="block text-center text-xs font-medium text-primary px-4 py-3 hover:bg-muted transition-colors border-t border-border">
          {t('see_all', { count })}
        </Link>
      )}
    </div>
  );
}
