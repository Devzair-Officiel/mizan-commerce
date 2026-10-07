'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { useMe } from '@/lib/hooks/useMe';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { DashboardNotice } from '@/components/dashboard/DashboardNotice';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NewShopWelcome } from '@/components/dashboard/NewShopWelcome';
import { ActiveShopDashboard } from '@/components/dashboard/ActiveShopDashboard';

function useGreeting(firstName: string | null): string {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const hours = new Date().getHours();

  const period: 'morning' | 'afternoon' | 'evening' =
    hours < 5 || hours >= 18 ? 'evening'
    : hours < 12 ? 'morning'
    : locale === 'fr' ? 'morning'
    : 'afternoon';

  const greetings = {
    morning: firstName ? t('greeting_morning_named', { name: firstName }) : t('greeting_morning'),
    afternoon: firstName ? t('greeting_afternoon_named', { name: firstName }) : t('greeting_afternoon'),
    evening: firstName ? t('greeting_evening_named', { name: firstName }) : t('greeting_evening'),
  };
  return greetings[period];
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { data, isLoading, isError, error } = useDashboard();
  const { data: me } = useMe();
  const formatDate = useFormatDate();

  const firstName = me?.full_name?.split(' ')[0] ?? null;
  const title = useGreeting(firstName);
  const subtitle = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const isNewShop = data !== undefined && !data.setup.has_orders;

  return (
    <>
      <TopBar title={title} subtitle={subtitle} />
      <div className="flex flex-col gap-4 p-4 lg:pt-0">

        <DashboardNotice />

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

        {data && !isNewShop && <ActiveShopDashboard data={data} />}
      </div>
    </>
  );
}
