'use client';

import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import type { InvoiceSettingsValues } from './schema';

function Option({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{help}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <span className={`absolute top-0.75 size-4.5 rounded-full bg-card transition-[inset-inline-start] ${checked ? 'inset-s-4.75' : 'inset-s-0.75'}`} />
      </button>
    </div>
  );
}

export function InvoiceOptionsSection({ form }: { form: UseFormReturn<InvoiceSettingsValues> }) {
  const t = useTranslations('invoice_settings');
  return (
    <FormSection icon={SlidersHorizontal} title={t('options')} order="max-lg:order-4">
      <Controller name="invoice_show_account_summary" control={form.control} render={({ field }) => (
        <Option label={t('account_summary')} help={t('account_summary_help')} checked={field.value} onChange={field.onChange} />
      )} />
      <div className="border-t border-border pt-3.5">
        <Controller name="invoice_show_order" control={form.control} render={({ field }) => (
          <Option label={t('show_order')} help={t('show_order_help')} checked={field.value} onChange={field.onChange} />
        )} />
      </div>
    </FormSection>
  );
}
