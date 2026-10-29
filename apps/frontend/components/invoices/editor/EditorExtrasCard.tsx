'use client';

import { useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_ROW } from '@/components/form/fieldStyles';
import { FloatingInput, FloatingSelectBase, FloatingSelectItem, FloatingTextarea } from '@/components/ui/floating-fields';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { OperationCategory } from '@/lib/hooks/useInvoices';
import { decimal, MAX_LENGTH, paymentTerms, type EditorValues } from './editorSchema';

const CATEGORIES: OperationCategory[] = ['goods', 'services', 'mixed'];

interface EditorExtrasCardProps {
  form: UseFormReturn<EditorValues>;
  currency: string;
  schedule: () => void;
}

/**
 * Carte facultative : remise, frais de port, nature de l'opération, échéance et notes imprimées
 * sur la facture. Repliée sur mobile, elle résume la remise et l'échéance.
 */
export function EditorExtrasCard({ form, currency, schedule }: EditorExtrasCardProps) {
  const t = useTranslations('invoices.editor.extras');
  const money = useFormatMoney();
  const [open, setOpen] = useState(false);
  const { register, setValue, control, formState: { errors } } = form;
  const [discount, days, category] = useWatch({ control, name: ['discount_amount', 'payment_terms_days', 'operation_category'] });
  const amount = Number(decimal(discount, 2) ?? 0);
  const summary = t('summary', { hasDiscount: amount ? 'yes' : 'no', discount: money(amount, currency), ...paymentTerms(days) });
  const error = errors.discount_amount ?? errors.shipping_amount ?? errors.payment_terms_days;
  const amountField = { inputMode: 'decimal' as const, autoComplete: 'off', suffix: currency, className: 'tabular-nums' };

  return <FormSection id="invoice-extras" icon={SlidersHorizontal} order="max-lg:order-3" title={t('title')} status="optional"
    description={t('description')} collapse={{ open, onToggle: () => setOpen((o) => !o), summary }}>
    <div className={FIELD_ROW}>
      <FloatingInput id="invoice-discount" label={t('discount')} {...amountField} aria-invalid={!!errors.discount_amount} {...register('discount_amount', { onChange: schedule })} />
      <FloatingInput id="invoice-shipping" label={t('shipping')} {...amountField} aria-invalid={!!errors.shipping_amount} {...register('shipping_amount', { onChange: schedule })} />
    </div>
    <div className={FIELD_ROW}>
      <FloatingSelectBase id="invoice-operation" label={t('operation')} value={category}
        onValueChange={(v) => { setValue('operation_category', v as OperationCategory, { shouldDirty: true }); schedule(); }}
        selectItems={CATEGORIES.map((value) => ({ value, label: t('operation_option', { value }) }))}>
        {CATEGORIES.map((value) => <FloatingSelectItem key={value} value={value}>{t('operation_option', { value })}</FloatingSelectItem>)}
      </FloatingSelectBase>
      <FloatingInput id="invoice-terms" label={t('terms')} suffix={t('days_suffix')} inputMode="numeric" autoComplete="off"
        aria-invalid={!!errors.payment_terms_days} {...register('payment_terms_days', { onChange: schedule })} />
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error.message}</p>}
    <FloatingTextarea id="invoice-notes" label={t('notes')} rows={3} maxLength={MAX_LENGTH.notes} dir="auto" {...register('notes', { onChange: schedule })} />
  </FormSection>;
}
