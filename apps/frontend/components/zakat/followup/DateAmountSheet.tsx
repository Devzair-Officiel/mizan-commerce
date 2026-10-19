'use client';

import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AMOUNT_PATTERN, compareDecimal, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import { SheetActions } from '../steps/SheetActions';
import type { ZakatFormat } from '../useZakatFormat';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DateAmount {
  date: string;
  /** Chaîne décimale normalisée (« 1234.50 »). */
  amount: string;
}

interface DateAmountSheetProps {
  title: string;
  description?: string;
  labels: { date: string; amount: string; submit: string };
  defaults: DateAmount;
  /** Jours au format ISO : `max` est aujourd'hui (fuseau de la boutique). */
  minDate?: string;
  maxDate: string;
  maxAmount?: string;
  format: ZakatFormat;
  onClose: () => void;
  /** La feuille reste ouverte : l'appelant la ferme une fois l'écriture faite. */
  onSubmit: (values: DateAmount) => void;
}

/** Date et montant d'un geste déjà fait (« Encaissée », « Versée ») ; le serveur revérifie les bornes. */
export function DateAmountSheet({ title, description, labels, defaults, minDate, maxDate, maxAmount, format, onClose, onSubmit }: DateAmountSheetProps) {
  const t = useTranslations('zakat.common');
  const formId = useId();
  const dateError = minDate ? t('date_between', { min: format.date(minDate), max: format.date(maxDate) }) : t('date_until', { max: format.date(maxDate) });
  const schema = z.object({
    date: z.string().refine((v) => DAY_PATTERN.test(v) && (!minDate || v >= minDate) && v <= maxDate, dateError),
    amount: z.string().trim()
      .refine((v) => AMOUNT_PATTERN.test(v) && !isZeroDecimal(normalizeDecimal(v)), t('amount_invalid'))
      .refine((v) => !maxAmount || !AMOUNT_PATTERN.test(v) || compareDecimal(normalizeDecimal(v), maxAmount) <= 0,
        t('amount_max', { max: maxAmount ? format.money(maxAmount) : '' })),
  });
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { date: defaults.date, amount: format.amountInput(defaults.amount) },
  });
  const submit = handleSubmit((values) => onSubmit({ date: values.date, amount: normalizeDecimal(values.amount) }));

  return (
    <BottomSheet open onClose={onClose} title={title} description={description}
      footer={<SheetActions formId={formId} submitLabel={labels.submit} onCancel={onClose} />}>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label={labels.date} required error={errors.date?.message}>
          {(c) => <input {...c} {...register('date')} type="date" min={minDate} max={maxDate} className={`${FIELD_CONTROL} tabular-nums`} />}
        </FormField>
        <FormField label={labels.amount} required error={errors.amount?.message}>
          {(c) => (
            <FieldSuffix suffix={format.symbol}>
              <input {...c} {...register('amount')} inputMode="decimal" autoComplete="off" placeholder="0,00" className={`${FIELD_CONTROL} pe-14 tabular-nums`} />
            </FieldSuffix>
          )}
        </FormField>
      </form>
    </BottomSheet>
  );
}
