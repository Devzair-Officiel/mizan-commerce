'use client';

import { useTranslations } from 'next-intl';
import { MailWarning } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { useShop } from '@/lib/hooks/useShop';
import { useMe, useResendEmailVerification } from '@/lib/hooks/useMe';
import { useFormatMoney, useFormatDate } from '@/lib/hooks/useFormat';
import { Button } from '@/components/ui/button';
import { NoticeCard } from '@/components/dashboard/NoticeCard';
import { CounterCard } from '@/components/dashboard/CounterCard';
import { CountersGrid } from '@/components/dashboard/CountersGrid';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { PrepareList } from '@/components/dashboard/PrepareList';
import { UnpaidList } from '@/components/dashboard/UnpaidList';
import { LowStockList } from '@/components/dashboard/LowStockList';
import { TodayRemindersList } from '@/components/dashboard/TodayRemindersList';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NewShopWelcome } from '@/components/dashboard/NewShopWelcome';
import { computeZakatDays, computeDelta } from '@/components/dashboard/utils';
export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { data, isLoading, isError, error } = useDashboard();
  const { data: shop } = useShop();
  const { data: me } = useMe();
  const currency = shop?.currency ?? 'EUR';
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();

  const firstName = me?.full_name?.split(' ')[0] ?? null;
  const title = firstName ? t('greeting_named', { name: firstName }) : t('greeting');
  const subtitle = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const needsEmailVerif = me !== undefined && !me.email_verified_at;
  const zakatDays = computeZakatDays(shop?.zakat_annual_date ?? null);
  const showZakat = !needsEmailVerif && zakatDays !== null && zakatDays <= 30;

  const revenueToday = data?.today.revenue ?? '0';
  const revenueYesterday = data?.today.revenue_yesterday ?? '0';
  const delta = computeDelta(parseFloat(revenueToday), parseFloat(revenueYesterday));
  const revenueSub = delta === null ? undefined
    : delta.pct === 0 ? t('counters.revenue_delta_same')
    : t('counters.revenue_delta', { sign: delta.positive ? '+' : '-', pct: Math.abs(delta.pct) });
  const revenueDeltaColor = delta === null || delta.pct === 0 ? 'text-muted-foreground'
    : delta.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  const isNewShop = data !== undefined && !data.setup.has_orders;

  return (
    <>
      <TopBar title={title} subtitle={subtitle} />
      <div className="flex flex-col gap-4 p-4 pt-0">

        {needsEmailVerif && <EmailNotice />}
        {showZakat && <ZakatNotice days={zakatDays!} />}

        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-medium">{t('error_title')}</p>
            <p className="mt-1 text-xs text-destructive/80">
              {(error as { status?: number })?.status === 403 ? t('error_no_shop') : t('error_server')}
            </p>
          </div>
        )}

        {isLoading && <DashboardSkeleton />}

        {data && isNewShop && (
          <NewShopWelcome
            productsCount={data.setup.products_count}
            customersCount={data.setup.customers_count}
          />
        )}

        {data && !isNewShop && (
          <>
            <CountersGrid>
              <CounterCard
                label={t('counters.revenue')}
                value={formatMoney(revenueToday, currency)}
                sub={revenueSub}
                subColor={revenueDeltaColor}
                href="/orders"
              />
              <CounterCard
                label={t('counters.orders')}
                value={data.today.orders_count}
                href="/orders"
              />
              <CounterCard
                label={t('counters.unpaid')}
                value={data.unpaid_orders.count}
                sub={data.unpaid_orders.count > 0 ? formatMoney(data.unpaid_orders.total_due, currency) : undefined}
                subColor="text-amber-700 dark:text-amber-400"
                href="/orders?payment_status=unpaid"
              />
              <CounterCard
                label={t('counters.low_stock')}
                value={data.low_stock_products.count}
                sub={data.low_stock_products.out_of_stock_count > 0 ? t('counters.low_stock_out', { count: data.low_stock_products.out_of_stock_count }) : undefined}
                subColor="text-red-600 dark:text-red-400"
                href="/products?filter=low_stock"
              />
            </CountersGrid>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 flex flex-col gap-4">
                <PrepareList
                  count={data.orders_to_prepare.count}
                  items={data.orders_to_prepare.items}
                  oldestCreatedAt={data.orders_to_prepare.oldest_created_at}
                />
                <UnpaidList
                  count={data.unpaid_orders.count}
                  items={data.unpaid_orders.items}
                  totalDue={data.unpaid_orders.total_due}
                />
              </div>
              <div className="lg:col-span-2 flex flex-col gap-4">
                <RevenueCard points={data.revenue_last_7_days} currency={currency} />
                <LowStockList
                  count={data.low_stock_products.count}
                  items={data.low_stock_products.items}
                  outOfStockCount={data.low_stock_products.out_of_stock_count}
                />
                <TodayRemindersList
                  count={data.today_reminders.count}
                  items={data.today_reminders.items}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EmailNotice() {
  const t = useTranslations('dashboard.notice');
  const { mutate, isPending, data, isSuccess } = useResendEmailVerification();
  const justVerified = isSuccess && data?.already_verified;
  const justSent = isSuccess && !data?.already_verified;
  const noticeTitle = justVerified ? t('email_verified') : justSent ? t('email_sent') : t('email_title');
  return (
    <NoticeCard
      icon={<MailWarning className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />}
      title={noticeTitle}
      sub={!isSuccess ? t('email_sub') : undefined}
      action={
        !justVerified ? (
          <Button size="sm" disabled={isPending} onClick={() => mutate()}
            className="h-7 shrink-0 bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700">
            {isPending ? '…' : justSent ? t('email_resend') : t('email_cta')}
          </Button>
        ) : undefined
      }
    />
  );
}

function ZakatNotice({ days }: { days: number }) {
  const t = useTranslations('dashboard.notice');
  return (
    <NoticeCard
      icon={<span className="text-amber-700 dark:text-amber-400 text-base leading-none">☾</span>}
      title={t('zakat_title', { days })}
      sub={t('zakat_sub')}
      action={
        <Button asChild size="sm" variant="outline"
          className="h-7 shrink-0 px-3 text-xs font-semibold border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20">
          <a href="/settings?tab=zakat">{t('zakat_cta')}</a>
        </Button>
      }
    />
  );
}
