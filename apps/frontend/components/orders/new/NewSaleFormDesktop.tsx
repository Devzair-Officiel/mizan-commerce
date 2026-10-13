'use client';

import { QuickAddCustomer } from '@/components/orders/QuickAddDialogs';
import { DesktopCatalogPanel } from '@/components/orders/new/DesktopCatalogPanel';
import { DesktopSaleTicket } from '@/components/orders/new/DesktopSaleTicket';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { Customer } from '@/lib/hooks/useCustomers';

/** Vue caisse grand écran : catalogue à gauche, ticket à droite, tous deux collés en haut au défilement. */
export function NewSaleFormDesktop({ form }: { form: NewSaleForm }) {
  return (
    <div className="flex gap-6 p-6 pb-10 items-start">
      <div className="flex-1 min-w-0 sticky top-8">
        <DesktopCatalogPanel form={form} />
      </div>
      <div className="w-105 shrink-0 sticky top-8">
        <DesktopSaleTicket form={form} />
      </div>
      <QuickAddCustomer
        open={form.createCustomerOpen}
        onOpenChange={form.setCreateCustomerOpen}
        onCreated={(c: Customer) => { form.setCustomerId(c.id); }}
      />
    </div>
  );
}
