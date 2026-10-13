'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DetailPageSkeleton } from '@/components/detail/DetailPageSkeleton';
import { TopBar } from '@/components/layout/TopBar';
import { OrderDetailView } from '@/components/orders/detail/OrderDetailView';
import { useOrderDetailState } from '@/components/orders/detail/useOrderDetailState';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('orders.detail');
  const state = useOrderDetailState(id);

  if (state.order) return <OrderDetailView order={state.order} state={state} />;
  if (state.isLoading) return <DetailPageSkeleton title={t('topbar')} left={[2, 4, 2]} right={[3, 3, 2]} />;

  return (
    <>
      <TopBar title={t('topbar')} back hideSearch />
      <p className="p-4 text-sm text-destructive">{t('not_found')}</p>
    </>
  );
}
