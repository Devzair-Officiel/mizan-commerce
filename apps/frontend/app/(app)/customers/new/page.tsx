'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { CustomerForm } from '@/components/customers/form/CustomerForm';
import { useCreateCustomer, type CustomerFormData } from '@/lib/hooks/useCustomers';
import { useBackOr } from '@/lib/hooks/useBackOr';

function NewCustomerContent() {
  const t = useTranslations('customers.new');
  const tNav = useTranslations('layout.nav');
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillName = searchParams.get('name') ?? '';
  const back = useBackOr('/customers');
  const { mutateAsync, isPending } = useCreateCustomer();

  async function handleSubmit(data: CustomerFormData) {
    const customer = await mutateAsync(data);
    router.replace(`/customers/${customer.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <TopBar title={t('title')} back backLabel={tNav('customers')} onBack={back} hideSearch />
      <CustomerForm
        mode="create"
        defaultValues={prefillName ? { name: prefillName } : undefined}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        onLeave={back}
      />
    </div>
  );
}

export default function NewCustomerPage() {
  return (
    <Suspense>
      <NewCustomerContent />
    </Suspense>
  );
}
