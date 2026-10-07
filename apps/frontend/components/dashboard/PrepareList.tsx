'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShoppingCart } from 'lucide-react';
import { useFormatMoney, useFormatDate, useFormatDateTime } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import type { OrderToPrepare } from '@/lib/hooks/useDashboard';

interface Props {
  count: number;
  items: OrderToPrepare[];
  oldestCreatedAt: string | null;
}

type TPrep = ReturnType<typeof useTranslations<'dashboard.prepare'>>;

function useRowDate(t: TPrep) {
  const formatDate = useFormatDate();
  const formatDateTime = useFormatDateTime();
  return (createdAt: string): string => {
    const date = new Date(createdAt);
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const time = formatDateTime(createdAt, { hour: '2-digit', minute: '2-digit' });
    if (dayMs === todayMs) return `${t('date_today')}, ${time}`;
    if (dayMs === todayMs - 86_400_000) return `${t('date_yesterday')}, ${time}`;
    return formatDate(createdAt, { day: 'numeric', month: 'short' });
  };
}

const PAYMENT_CLS: Record<string, string> = {
  paid: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400',
  partial: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400',
  unpaid: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400',
};

function PaymentBadge({ status, t }: { status: string; t: TPrep }) {
  const labels: Record<string, string> = {
    paid: t('payment_paid'),
    partial: t('payment_partial'),
    unpaid: t('payment_unpaid'),
  };
  const cls = PAYMENT_CLS[status] ?? PAYMENT_CLS.unpaid;
  return (
    <span className={`inline-flex items-center justify-center h-6 min-w-20 px-2.5 rounded-full text-xs font-semibold shrink-0 ${cls}`}>
      {labels[status] ?? labels.unpaid}
    </span>
  );
}

export function PrepareList({ count, items }: Props) {
  const t = useTranslations('dashboard.prepare');
  const formatMoney = useFormatMoney();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const rowDate = useRowDate(t);

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
    <DashboardCard title={t('title')} rightLink={{ label: t('see_all_link'), href: '/orders?status=to_prepare' }}>
      <div className="divide-y divide-border">
        {items.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted active:bg-muted transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">
                  {o.customer_name ?? <span className="text-muted-foreground">{t('no_customer')}</span>}
                </span>
                <span className="text-[0.8125rem] text-muted-foreground shrink-0">{o.order_number}</span>
              </div>
              {o.items_preview.length > 0 && (
                <p className="text-[0.8125rem] text-muted-foreground truncate mt-0.5">
                  {o.items_preview.map((item) => `${item.name} ×${item.quantity}`).join(', ')}
                  {o.items_count > o.items_preview.length && ` +${o.items_count - o.items_preview.length}`}
                </p>
              )}
            </div>
            <span className="hidden sm:block text-[0.8125rem] text-muted-foreground shrink-0 tabular-nums">
              {rowDate(o.created_at)}
            </span>
            <PaymentBadge status={o.payment_status} t={t} />
            <span className="text-sm font-semibold tabular-nums text-foreground shrink-0 w-20 text-right">
              {formatMoney(o.total_amount, currency)}
            </span>
          </Link>
        ))}
      </div>
      {count > items.length && (
        <Link href="/orders?status=to_prepare"
          className="block text-center text-[0.8125rem] font-medium text-primary px-5 py-3.5 hover:bg-muted transition-colors border-t border-border">
          {t('see_all', { count })}
        </Link>
      )}
    </DashboardCard>
  );
}
