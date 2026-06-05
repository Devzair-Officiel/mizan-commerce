'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { useCustomer, useUpdateCustomer } from '@/lib/hooks/useCustomers';

export default function EditCustomerPage() {
  const t = useTranslations('customers.edit');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(id);
  const { mutateAsync, isPending } = useUpdateCustomer(id);

  async function handleSubmit(data: Parameters<typeof mutateAsync>[0]) {
    await mutateAsync(data);
    router.push(`/customers/${id}`);
  }

  if (isLoading) return <><TopBar title={t('topbar_short')} /><p className="p-4 text-sm text-muted-foreground">{t('loading')}</p></>;

  return (
    <>
      <TopBar title={t('title')} />
      <CustomerForm defaultValues={customer} onSubmit={handleSubmit} isSubmitting={isPending} />
    </>
  );
}
