'use client';

import { useTranslations } from 'next-intl';
import { Package, Clock, AlertTriangle, Bell } from 'lucide-react';
import { useFormatMoney, useFormatDateTime, useRelativeTime } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { StatCard } from '@/components/ui/StatCard';
import { CountersGrid } from '@/components/dashboard/CountersGrid';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { PrepareList } from '@/components/dashboard/PrepareList';
import { UnpaidList } from '@/components/dashboard/UnpaidList';
import { LowStockList } from '@/components/dashboard/LowStockList';
import { TodayRemindersList } from '@/components/dashboard/TodayRemindersList';
import { computeDelta } from '@/components/dashboard/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

interface Props { data: DashboardData; }

type TDashboard = ReturnType<typeof useTranslations<'dashboard'>>;

function getRevenueDeltaDisplay(today: number, yesterday: number, t: TDashboard) {
  const delta = computeDelta(today, yesterday);
  if (delta === null) return { text: undefined, color: 'text-muted-foreground' as const };
  const text = delta.pct === 0
    ? t('counters.revenue_delta_same')
    : t('counters.revenue_delta', { sign: delta.positive ? '+' : '-', pct: Math.abs(delta.pct) });
  const color = delta.pct === 0 ? 'text-muted-foreground' as const
    : delta.positive ? 'text-green-600 dark:text-green-400' as const : 'text-amber-700 dark:text-amber-400' as const;
  return { text, color };
}

function getRemindersSub(
  count: number,
  items: { is_overdue: boolean; due_at: string }[],
  t: TDashboard,
  formatDateTime: (v: string, opts?: Intl.DateTimeFormatOptions) => string,
) {
  if (count === 0) return { sub: undefined, tone: 'neutral' as const };
  const overdueCount = items.filter((r) => r.is_overdue).length;
  const nextNonOverdue = items.find((r) => !r.is_overdue);
  const sub = overdueCount > 0
    ? t('counters.reminders_late', { count: overdueCount })
    : nextNonOverdue
      ? t('counters.reminders_next', { time: formatDateTime(nextNonOverdue.due_at, { hour: '2-digit', minute: '2-digit' }) })
      : undefined;
  const tone = overdueCount > 0 ? 'amber' as const : 'neutral' as const;
  return { sub, tone };
}

function getLowStockSub(outOfStock: number, t: TDashboard) {
  if (outOfStock <= 0) return t('counters.low_stock_unit');
  return (
    <>
      {t('counters.low_stock_unit')}{', '}
      <span className="text-red-600 dark:text-red-400">
        {t('counters.low_stock_sub', { count: outOfStock })}
      </span>
    </>
  );
}

function useActiveShopDashboardData(data: DashboardData) {
  const t = useTranslations('dashboard');
  const formatMoney = useFormatMoney();
  const formatDateTime = useFormatDateTime();
  const relativeTime = useRelativeTime();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const catalogKind = shop?.catalog_kind ?? 'both';
  const revenueDelta = getRevenueDeltaDisplay(
    parseFloat(data.today.revenue), parseFloat(data.today.revenue_yesterday), t,
  );
  const oldestSub = data.orders_to_prepare.oldest_created_at
    ? t('counters.prepare_sub', { age: relativeTime(data.orders_to_prepare.oldest_created_at) })
    : undefined;
  const reminders = getRemindersSub(
    data.today_reminders.count, data.today_reminders.items, t, formatDateTime,
  );
  return { t, formatMoney, currency, catalogKind, revenueDelta, oldestSub, reminders };
}

export function ActiveShopDashboard({ data }: Props) {
  const { t, formatMoney, currency, catalogKind, revenueDelta, oldestSub, reminders } =
    useActiveShopDashboardData(data);

  const outOfStock = data.low_stock_products.out_of_stock_count;
  const lowStockSub = getLowStockSub(outOfStock, t);

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
          {t('counters.section_today')}
        </p>
        <CountersGrid>
          <StatCard
            label={t('prepare.title')}
            value={data.orders_to_prepare.count}
            sub={oldestSub}
            href="/orders?status=to_prepare"
            icon={<Package size={15} />}
          />
          <StatCard
            label={t('unpaid.title')}
            value={formatMoney(data.unpaid_orders.total_due, currency)}
            sub={t('counters.unpaid_sub', { count: data.unpaid_orders.count })}
            href="/orders?due=true"
            icon={<Clock size={15} />}
            tone="amber"
            toneValue
          />
          {catalogKind !== 'services' && (
            <StatCard
              label={t('low_stock.title')}
              value={data.low_stock_products.count}
              sub={lowStockSub}
              href="/stock"
              icon={<AlertTriangle size={15} />}
              tone={outOfStock > 0 ? 'red' : 'neutral'}
            />
          )}
          <StatCard
            label={t('reminders.title')}
            value={data.today_reminders.count}
            sub={reminders.sub}
            subTone={reminders.tone}
            href="/reminders"
            icon={<Bell size={15} />}
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
            revenueDeltaText={revenueDelta.text}
            revenueDeltaColor={revenueDelta.color}
          />
          {catalogKind !== 'services' && (
            <LowStockList count={data.low_stock_products.count} items={data.low_stock_products.items}
              outOfStockCount={data.low_stock_products.out_of_stock_count} />
          )}
          <TodayRemindersList count={data.today_reminders.count} items={data.today_reminders.items} />
        </div>
      </div>
    </>
  );
}
