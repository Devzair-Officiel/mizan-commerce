'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import { customerInitials } from '@/components/customers/detail/constants';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { InvoiceCustomerSheet } from './InvoiceCustomerSheet';

interface EditorCustomerCardProps {
  /** Identifiant du client, vide sans client. */
  value: string;
  onChange: (id: string) => void;
}

/**
 * Carte « Client » : client choisi (initiales, nom, particulier ou professionnel, « Changer »), ou
 * bouton de choix. Le sélecteur propose « Créer « X » » avec la recherche, sauf si ce nom existe.
 */
export function EditorCustomerCard({ value, onChange }: EditorCustomerCardProps) {
  const t = useTranslations('invoices.editor.customer');
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const { data: customer } = useCustomer(value);
  const selected = value && customer?.id === value ? customer : null;
  const change = <button type="button" onClick={() => setPicking(true)} className={HEADER_LINK}>{t('change')}</button>;

  return <FormSection id="invoice-customer" icon={UserRound} order="max-lg:order-1" title={t('title')} status="required" action={selected ? change : undefined}>
    {selected
      ? <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground">
          {customerInitials(selected.first_name, selected.name)}
        </span>
        <div className="min-w-0">
          <p dir="auto" className="truncate text-[0.9375rem] font-semibold">{selected.display_name}</p>
          <p className="text-[0.8125rem] text-muted-foreground">{t('type', { value: selected.customer_type })}</p>
        </div>
      </div>
      : <button type="button" onClick={() => setPicking(true)} aria-haspopup="dialog"
        className="flex min-h-12 items-center gap-3 rounded-2xl border border-dashed border-border px-4 text-start text-sm font-medium text-primary transition-colors hover:bg-muted">
        <UserRound size={18} aria-hidden />{t(value ? 'loading' : 'choose')}
      </button>}
    <CustomerPicker hideTrigger open={picking} onOpenChange={setPicking} value={value} selectedCustomer={selected}
      onChange={(id) => { onChange(id); setPicking(false); }} createFromSearch onRequestCreate={(search) => setCreating(search)} />
    {creating !== null && <InvoiceCustomerSheet name={creating} onClose={() => setCreating(null)} onCreated={(c) => onChange(c.id)} />}
  </FormSection>;
}
