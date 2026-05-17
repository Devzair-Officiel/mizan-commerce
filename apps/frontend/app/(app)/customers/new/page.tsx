'use client';

import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { useCreateCustomer } from '@/lib/hooks/useCustomers';

export default function NewCustomerPage() {
  const router = useRouter();
  const { mutateAsync, isPending } = useCreateCustomer();

  async function handleSubmit(data: Parameters<typeof mutateAsync>[0]) {
    const customer = await mutateAsync(data);
    router.push(`/customers/${customer.id}`);
  }

  return (
    <>
      <TopBar title="Nouveau client" />
      <CustomerForm onSubmit={handleSubmit} isSubmitting={isPending} />
    </>
  );
}
