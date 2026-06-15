'use client';

import { useTranslations } from 'next-intl';
import { ShoppingCart, Clock, AlertTriangle, Bell } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { useShop } from '@/lib/hooks/useShop';
import { EmailVerificationBanner } from '@/components/account/EmailVerificationBanner';
import { ZakatBanner } from '@/components/dashboard/ZakatBanner';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { QuickShortcuts } from '@/components/dashboard/QuickShortcuts';
import { RevenueSparkline } from '@/components/dashboard/RevenueSparkline';
import { Section } from '@/components/dashboard/Section';
import { OrderRow, ReminderRow, SeeAllRow, StockRow } from '@/components/dashboard/rows';
import { computeZakatDays } from '@/components/dashboard/utils';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tNav = useTranslations('layout.nav');
  const tSections = useTranslations('dashboard.sections');

  const { data, isLoading, isError, error } = useDashboard();
  const { data: shop } = useShop();

  const currency = shop?.currency ?? 'EUR';
  const isMinimal = shop?.dashboard_mode === 'minimal';

  const revenueToday = Number(data?.today.revenue ?? 0);
  const revenueYesterday = Number(data?.today.revenue_yesterday ?? 0);
  const ordersCount = data?.today.orders_count ?? 0;
  const avgTicket = ordersCount > 0 ? revenueToday / ordersCount : 0;
  const zakatDays = computeZakatDays(shop?.zakat_annual_date ?? null);

  return (
    <>
      <TopBar title={tNav('dashboard')} />
      <div className="p-4 lg:px-8 lg:py-6 flex flex-col gap-4">

        <EmailVerificationBanner />

        {zakatDays !== null && zakatDays <= 30 && <ZakatBanner daysUntil={zakatDays} />}

        <KpiCards
          hasData={Boolean(data)}
          revenueToday={revenueToday}
          revenueYesterday={revenueYesterday}
          ordersCount={ordersCount}
          avgTicket={avgTicket}
          currency={currency}
        />

        {data && !isMinimal && <RevenueSparkline points={data.revenue_last_7_days} currency={currency} />}

        {isMinimal && <QuickShortcuts />}

        {isLoading && !isMinimal && (
          <div className="flex flex-col gap-2 mt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-medium">{t('error_title')}</p>
            <p className="mt-1 text-xs text-destructive/80">
              {(error as { status?: number })?.status === 403
                ? t('error_no_shop')
                : t('error_server')}
            </p>
          </div>
        )}

        {data && !isMinimal && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 flex flex-col gap-4">
              <Section
                icon={<ShoppingCart size={15} />}
                title={tSections('to_prepare_title')}
                count={data.orders_to_prepare.count}
                emptyIcon={<ShoppingCart size={20} className="text-muted-foreground" />}
                emptyLabel={tSections('to_prepare_empty')}
                emptySub={tSections('to_prepare_empty_sub')}
                accentClass="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900"
                headerBg="bg-blue-50/60 dark:bg-blue-950/40"
                defaultOpen
              >
                {data.orders_to_prepare.items.slice(0, 3).map((o) => (
                  <OrderRow key={o.id} id={o.id} label={o.order_number} sub={o.customer_name} amount={o.total_amount} currency={currency} />
                ))}
                {data.orders_to_prepare.count > 3 && (
                  <SeeAllRow href="/orders?status=to_prepare" count={data.orders_to_prepare.count} />
                )}
              </Section>

              <Section
                icon={<Clock size={15} />}
                title={tSections('unpaid_title')}
                count={data.unpaid_orders.count}
                emptyIcon={<Clock size={20} className="text-muted-foreground" />}
                emptyLabel={tSections('unpaid_empty')}
                emptySub={tSections('unpaid_empty_sub')}
                accentClass="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900"
                headerBg="bg-amber-50/60 dark:bg-amber-950/40"
                defaultOpen
              >
                {data.unpaid_orders.items.slice(0, 3).map((o) => (
                  <OrderRow key={o.id} id={o.id} label={o.order_number} sub={o.customer_name} amount={o.total_amount} currency={currency} />
                ))}
                {data.unpaid_orders.count > 3 && (
                  <SeeAllRow href="/orders?payment_status=unpaid" count={data.unpaid_orders.count} />
                )}
              </Section>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-4">
              <Section
                icon={<AlertTriangle size={15} />}
                title={tSections('low_stock_title')}
                count={data.low_stock_products.count}
                emptyIcon={<AlertTriangle size={20} className="text-muted-foreground" />}
                emptyLabel={tSections('low_stock_empty')}
                emptySub={tSections('low_stock_empty_sub')}
                accentClass="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900"
                headerBg="bg-red-50/60 dark:bg-red-950/40"
                defaultOpen={false}
              >
                {data.low_stock_products.items.slice(0, 3).map((p) => (
                  <StockRow
                    key={p.variant_id}
                    id={p.id}
                    name={p.name}
                    variantName={p.variant_name}
                    qty={p.stock_quantity}
                    unit={p.unit}
                    baseQuantity={p.base_quantity}
                  />
                ))}
                {data.low_stock_products.count > 3 && (
                  <SeeAllRow href="/products?filter=low_stock" count={data.low_stock_products.count} />
                )}
              </Section>

              <Section
                icon={<Bell size={15} />}
                title={tSections('reminders_title')}
                count={data.today_reminders.count}
                emptyIcon={<Bell size={20} className="text-muted-foreground" />}
                emptyLabel={tSections('reminders_empty')}
                emptySub={tSections('reminders_empty_sub')}
                accentClass="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-900"
                headerBg="bg-purple-50/60 dark:bg-purple-950/40"
                defaultOpen={false}
              >
                {data.today_reminders.items.slice(0, 3).map((r) => (
                  <ReminderRow key={r.id} title={r.title} due_at={r.due_at} />
                ))}
                {data.today_reminders.count > 3 && (
                  <SeeAllRow href="/reminders" count={data.today_reminders.count} />
                )}
              </Section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
