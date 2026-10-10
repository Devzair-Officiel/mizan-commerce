'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { OrderDetailView } from '@/components/orders/detail/OrderDetailView';
import { useOrderDetailState } from '@/components/orders/detail/useOrderDetailState';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('orders.detail');
  const state = useOrderDetailState(id);

  if (state.order) return <OrderDetailView order={state.order} state={state} />;

  return (
    <>
      <TopBar title={t('topbar')} back hideSearch />
      {state.isLoading ? (
        <div className="flex flex-col gap-4 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 h-4 w-1/3 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-destructive">{t('not_found')}</p>
      )}
    </>
  );
}
