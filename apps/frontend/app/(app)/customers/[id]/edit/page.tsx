'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { CustomerForm } from '@/components/customers/form/CustomerForm';
import { useCustomer, useUpdateCustomer, type CustomerFormData } from '@/lib/hooks/useCustomers';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useFormatDate } from '@/lib/hooks/useFormat';

export default function EditCustomerPage() {
  const t = useTranslations('customers.edit');
  const tDetail = useTranslations('customers.detail');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const formatDate = useFormatDate();
  const back = useBackOr(`/customers/${id}`);
  const { data: customer, isLoading } = useCustomer(id);
  const { mutateAsync, isPending } = useUpdateCustomer(id);

  async function handleSubmit(data: CustomerFormData) {
    await mutateAsync(data);
    // Remplace le formulaire dans l'historique : « retour » depuis la fiche ne le rouvre pas.
    router.replace(`/customers/${id}`);
  }

  if (isLoading || !customer) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <TopBar title={t('title')} back onBack={back} hideSearch />
        {isLoading
          ? <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
          : <p className="p-4 text-sm text-destructive">{tDetail('not_found')}</p>}
      </div>
    );
  }

  const subtitle = t('subtitle', {
    date: formatDate(customer.created_at, { month: 'long', year: 'numeric' }),
    count: customer.order_count,
  });
  return (
    <div className="mx-auto w-full max-w-4xl">
      <TopBar title={t('title')} subtitle={subtitle} back backLabel={customer.name} onBack={back} hideSearch />
      <CustomerForm mode="edit" defaultValues={customer} onSubmit={handleSubmit} isSubmitting={isPending} onLeave={back} />
    </div>
  );
}
