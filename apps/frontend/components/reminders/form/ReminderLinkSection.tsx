'use client';

import { useState } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ChevronDown, Link2, X } from 'lucide-react';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { NO_ORDER, useOrderOptions } from './useOrderOptions';
import type { ReminderFormValues } from './useReminderForm';

interface ReminderLinkSectionProps {
  control: Control<ReminderFormValues>;
  setValue: UseFormSetValue<ReminderFormValues>;
  errors: FieldErrors<ReminderFormValues>;
  customer: string;
  order: string;
  open: boolean;
  onToggle: () => void;
}

/** Carte « Lié à » (facultative) : client, puis une de ses commandes non soldées. */
export function ReminderLinkSection({ control, setValue, errors, customer, order, open, onToggle }: ReminderLinkSectionProps) {
  const t = useTranslations('reminders.form');
  const [picking, setPicking] = useState(false);
  const { data: selected } = useCustomer(customer);
  const orderOptions = useOrderOptions(customer, order);
  const customerName = customer ? selected?.display_name ?? '' : '';
  const orderLabel = orderOptions.find((o) => o.value === order)?.label ?? '';

  // Un autre client : la commande liée n'est plus la sienne.
  function chooseCustomer(id: string) {
    setValue('customer', id, { shouldDirty: true });
    if (id !== customer) setValue('order', '', { shouldDirty: true });
  }

  return (
    <FormSection icon={Link2} order="max-lg:order-3" title={t('section_link')} status="optional" description={t('section_link_help')}
      collapse={{ open, onToggle, summary: [customerName, orderLabel].filter(Boolean).join(' · ') }}>
      <FormField label={t('customer')} error={errors.customer?.message}>
        {(c) => (
          <div className="relative">
            <Controller control={control} name="customer" render={({ field }) => (
              <button {...c} ref={field.ref} type="button" aria-haspopup="dialog" onClick={() => setPicking(true)}
                className={`${FIELD_CONTROL} flex items-center justify-between gap-2 pe-3 text-start`}>
                <span className={`truncate ${customer ? '' : 'text-muted-foreground'}`}>{customer ? customerName : t('customer_placeholder')}</span>
                {!customer && <ChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden />}
              </button>
            )} />
            {customer && (
              <button type="button" onClick={() => chooseCustomer('')} aria-label={t('customer_remove')}
                className="absolute inset-e-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
        )}
      </FormField>
      <FormField label={t('order')} help={customer ? t('order_help') : t('order_help_no_customer')} error={errors.order?.message}>
        {(c) => (
          <Controller control={control} name="order" render={({ field }) => (
            <FormSelect control={c} value={field.value || NO_ORDER} onChange={(v) => field.onChange(v === NO_ORDER ? '' : v)}
              options={orderOptions} triggerRef={field.ref} />
          )} />
        )}
      </FormField>
      <CustomerPicker hideTrigger open={picking} onOpenChange={setPicking} value={customer} onChange={chooseCustomer} />
    </FormSection>
  );
}
