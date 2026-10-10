'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { CustomerDetailView } from '@/components/customers/detail/CustomerDetailView';
import { useCustomer } from '@/lib/hooks/useCustomers';

export default function CustomerDetailPage() {
  const t = useTranslations('customers.detail');
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);

  if (isLoading) return <><TopBar title={t('topbar_short')} back hideSearch /><p className="p-4 text-sm text-muted-foreground">{t('loading')}</p></>;
  if (!customer) return <><TopBar title={t('topbar_short')} back hideSearch /><p className="p-4 text-sm text-destructive">{t('not_found')}</p></>;
  // `key` : l'état de la fiche (fenêtres, rappel du jour) repart à zéro d'un client à l'autre.
  return <CustomerDetailView key={customer.id} customer={customer} />;
}
