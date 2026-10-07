'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney, useFormatDateTime, useRelativeTime } from '@/lib/hooks/useFormat';
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
  const formatDateTime = useFormatDateTime();
  const relativeTime = useRelativeTime();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';

  const delta = computeDelta(parseFloat(data.today.revenue), parseFloat(data.today.revenue_yesterday));
  const revenueDeltaText = delta === null ? undefined
    : delta.pct === 0 ? t('counters.revenue_delta_same')
    : t('counters.revenue_delta', { sign: delta.positive ? '+' : '-', pct: Math.abs(delta.pct) });
  const revenueDeltaColor = delta === null || delta.pct === 0 ? 'text-muted-foreground'
    : delta.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  const oldestSub = data.orders_to_prepare.oldest_created_at
    ? t('counters.prepare_sub', { age: relativeTime(data.orders_to_prepare.oldest_created_at) })
    : undefined;

  const overdueCount = data.today_reminders.items.filter((r) => r.is_overdue).length;
  const nextNonOverdue = data.today_reminders.items.find((r) => !r.is_overdue);
  const remindersSub = data.today_reminders.count === 0 ? undefined
    : overdueCount > 0 ? t('counters.reminders_late', { count: overdueCount })
    : nextNonOverdue ? t('counters.reminders_next', { time: formatDateTime(nextNonOverdue.due_at, { hour: '2-digit', minute: '2-digit' }) })
    : undefined;
  const remindersSubColor = overdueCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground';

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
          {t('counters.section_today')}
        </p>
        <CountersGrid>
          <CounterCard
            label={t('prepare.title')}
            value={data.orders_to_prepare.count}
            sub={oldestSub}
            href="/orders?status=to_prepare"
          />
          <CounterCard
            label={t('unpaid.title')}
            value={formatMoney(data.unpaid_orders.total_due, currency)}
            valueColor="text-amber-700 dark:text-amber-400"
            sub={t('counters.unpaid_sub', { count: data.unpaid_orders.count })}
            href="/orders?due=true"
          />
          <CounterCard
            label={t('low_stock.title')}
            value={data.low_stock_products.count}
            sub={data.low_stock_products.out_of_stock_count > 0
              ? t('counters.low_stock_sub', { count: data.low_stock_products.out_of_stock_count })
              : undefined}
            subColor="text-red-600 dark:text-red-400"
            href="/stock"
          />
          <CounterCard
            label={t('reminders.title')}
            value={data.today_reminders.count}
            sub={remindersSub}
            subColor={remindersSubColor}
            href="/reminders"
          />
        </CountersGrid>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 flex flex-col gap-4">
          <PrepareList count={data.orders_to_prepare.count} items={data.orders_to_prepare.items}
            oldestCreatedAt={data.orders_to_prepare.oldest_created_at} />
          <UnpaidList count={data.unpaid_orders.count} items={data.unpaid_orders.items}
            totalDue={data.unpaid_orders.total_due} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <RevenueCard
            points={data.revenue_last_7_days}
            currency={currency}
            todayRevenue={data.today.revenue}
            todayOrdersCount={data.today.orders_count}
            revenueDeltaText={revenueDeltaText}
            revenueDeltaColor={revenueDeltaColor}
          />
          <LowStockList count={data.low_stock_products.count} items={data.low_stock_products.items}
            outOfStockCount={data.low_stock_products.out_of_stock_count} />
          <TodayRemindersList count={data.today_reminders.count} items={data.today_reminders.items} />
        </div>
      </div>
    </>
  );
}
