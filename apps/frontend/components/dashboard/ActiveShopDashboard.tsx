'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { CounterCard } from '@/components/dashboard/CounterCard';
import { CountersGrid } from '@/components/dashboard/CountersGrid';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { PrepareList } from '@/components/dashboard/PrepareList';
import { UnpaidList } from '@/components/dashboard/UnpaidList';
import { LowStockList } from '@/components/dashboard/LowStockList';
import { TodayRemindersList } from '@/components/dashboard/TodayRemindersList';
import { computeDelta } from '@/components/dashboard/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

interface Props { data: DashboardData; }

export function ActiveShopDashboard({ data }: Props) {
  const t = useTranslations('dashboard');
  const formatMoney = useFormatMoney();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';

  const revenueToday = data.today.revenue;
  const delta = computeDelta(parseFloat(revenueToday), parseFloat(data.today.revenue_yesterday));
  const revenueSub = delta === null ? undefined
    : delta.pct === 0 ? t('counters.revenue_delta_same')
    : t('counters.revenue_delta', { sign: delta.positive ? '+' : '-', pct: Math.abs(delta.pct) });
  const revenueDeltaColor = delta === null || delta.pct === 0 ? 'text-muted-foreground'
    : delta.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <>
      <CountersGrid>
        <CounterCard label={t('counters.revenue')} value={formatMoney(revenueToday, currency)}
          sub={revenueSub} subColor={revenueDeltaColor} href="/orders" />
        <CounterCard label={t('counters.orders')} value={data.today.orders_count} href="/orders" />
        <CounterCard label={t('counters.unpaid')} value={data.unpaid_orders.count}
          sub={data.unpaid_orders.count > 0 ? formatMoney(data.unpaid_orders.total_due, currency) : undefined}
          subColor="text-amber-700 dark:text-amber-400" href="/orders?payment_status=unpaid" />
        <CounterCard label={t('counters.low_stock')} value={data.low_stock_products.count}
          sub={data.low_stock_products.out_of_stock_count > 0 ? t('counters.low_stock_out', { count: data.low_stock_products.out_of_stock_count }) : undefined}
          subColor="text-red-600 dark:text-red-400" href="/products?filter=low_stock" />
      </CountersGrid>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 flex flex-col gap-4">
          <PrepareList count={data.orders_to_prepare.count} items={data.orders_to_prepare.items}
            oldestCreatedAt={data.orders_to_prepare.oldest_created_at} />
          <UnpaidList count={data.unpaid_orders.count} items={data.unpaid_orders.items}
            totalDue={data.unpaid_orders.total_due} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <RevenueCard points={data.revenue_last_7_days} currency={currency} />
          <LowStockList count={data.low_stock_products.count} items={data.low_stock_products.items}
            outOfStockCount={data.low_stock_products.out_of_stock_count} />
          <TodayRemindersList count={data.today_reminders.count} items={data.today_reminders.items} />
        </div>
      </div>
    </>
  );
}
