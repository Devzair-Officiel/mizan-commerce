'use client';

import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { useCustomer, useUpdateCustomer } from '@/lib/hooks/useCustomers';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(id);
  const { mutateAsync, isPending } = useUpdateCustomer(id);

  async function handleSubmit(data: Parameters<typeof mutateAsync>[0]) {
    await mutateAsync(data);
    router.push(`/customers/${id}`);
  }

  if (isLoading) return <><TopBar title="Modifier" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;

  return (
    <>
      <TopBar title="Modifier le client" />
      <CustomerForm defaultValues={customer} onSubmit={handleSubmit} isSubmitting={isPending} />
    </>
  );
}
