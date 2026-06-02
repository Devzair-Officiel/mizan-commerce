'use client';

import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
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

      {/* Hero — point d'ancrage pour la création */}
      <div className="px-4 pt-4 lg:max-w-2xl lg:mx-auto lg:px-8">
        <div
          className="rounded-3xl p-5 flex items-center gap-4"
          style={{ background: 'color-mix(in oklch, var(--primary) 7%, transparent)' }}
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-md ring-2 ring-background"
            style={{ background: 'var(--primary)' }}
          >
            <UserPlus size={24} />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-semibold text-foreground">Nouveau contact</p>
            <p className="text-xs text-muted-foreground">
              Renseignez au minimum le nom. Le reste pourra être complété plus tard.
            </p>
          </div>
        </div>
      </div>

      <CustomerForm onSubmit={handleSubmit} isSubmitting={isPending} />
    </>
  );
}
