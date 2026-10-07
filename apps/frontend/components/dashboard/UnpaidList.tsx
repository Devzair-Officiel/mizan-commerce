'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { UnpaidRow } from '@/components/dashboard/UnpaidRow';
import type { UnpaidOrder } from '@/lib/hooks/useDashboard';

interface Props { count: number; items: UnpaidOrder[]; totalDue: string; }

export function UnpaidList({ count, items, totalDue }: Props) {
  const t = useTranslations('dashboard.unpaid');
  const formatMoney = useFormatMoney();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Clock size={20} className="text-muted-foreground" />
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
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-xs font-semibold px-2 py-0.5">{count}</span>
        {parseFloat(totalDue) > 0 && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {t('total_due', { amount: formatMoney(totalDue, currency) })}
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {items.map((o) => <UnpaidRow key={o.id} order={o} currency={currency} />)}
      </div>
      {count > items.length && (
        <Link href="/orders?payment_status=unpaid"
          className="block text-center text-xs font-medium text-primary px-4 py-3 hover:bg-muted transition-colors border-t border-border">
          {t('see_all', { count })}
        </Link>
      )}
    </div>
  );
}
