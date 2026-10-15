'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { DetailPageSkeleton } from '@/components/detail/DetailPageSkeleton';
import { InvoiceDetailView } from '@/components/invoices/detail/InvoiceDetailView';
import { useInvoiceDetailState } from '@/components/invoices/detail/useInvoiceDetailState';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('invoices.detail');
  const state = useInvoiceDetailState(id);
  if (state.invoice) return <InvoiceDetailView invoice={state.invoice} state={state} />;
  if (state.isLoading) return <DetailPageSkeleton title={t('title')} left={[3, 6, 4]} right={[5, 3, 2]} />;
  return <><TopBar title={t('title')} back hideSearch /><p role="alert" className="p-4 text-sm text-destructive">{t('not_found')}</p></>;
}
