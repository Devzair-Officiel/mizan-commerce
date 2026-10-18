'use client';

import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Switch } from '@/components/ui/Switch';
import { AMOUNT_PATTERN, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import type { ReceivableItem } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';
import { SheetActions } from '../SheetActions';

interface ReceivableSheetProps {
  /** Créance saisie à la main à modifier ; absente pour un ajout. */
  item?: ReceivableItem;
  format: ZakatFormat;
  onClose: () => void;
  onSubmit: (item: ReceivableItem) => void;
  onDelete?: () => void;
}

/** Créance hors commande Mizan : description, montant dû, sûre ou douteuse. */
export function ReceivableSheet({ item, format, onClose, onSubmit, onDelete }: ReceivableSheetProps) {
  const t = useTranslations('zakat.steps.receivables');
  const tc = useTranslations('zakat.common');
  const formId = useId();
  const schema = z.object({
    label: z.string().trim().min(1, tc('label_required')).max(200),
    amount: z.string().trim().refine((v) => AMOUNT_PATTERN.test(v) && !isZeroDecimal(normalizeDecimal(v)), tc('amount_invalid')),
    doubtful: z.boolean(),
  });
  const { register, control, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { label: item?.label ?? '', amount: item ? format.amountInput(item.amount) : '', doubtful: item?.doubtful ?? false },
  });
  const submit = handleSubmit((values) => {
    onSubmit({ order_id: null, label: values.label, amount: normalizeDecimal(values.amount), doubtful: values.doubtful });
    onClose();
  });

  return (
    <BottomSheet open onClose={onClose} title={t(item ? 'sheet_edit' : 'sheet_add')}
      footer={<SheetActions formId={formId} submitLabel={tc(item ? 'save' : 'add')} onCancel={onClose} onDelete={onDelete} deleteLabel={t('delete_line')} />}>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label={t('field_label')} required error={errors.label?.message}>
          {(c) => <input {...c} {...register('label')} dir="auto" autoComplete="off" placeholder={t('field_label_placeholder')} className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('field_amount')} required error={errors.amount?.message}>
          {(c) => (
            <FieldSuffix suffix={format.symbol}>
              <input {...c} {...register('amount')} inputMode="decimal" autoComplete="off" placeholder="0,00" className={`${FIELD_CONTROL} pe-14 tabular-nums`} />
            </FieldSuffix>
          )}
        </FormField>
        <Controller control={control} name="doubtful" render={({ field }) => (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t('field_doubtful')}</p>
              <p className="text-xs text-muted-foreground">{t('field_doubtful_help')}</p>
            </div>
            <Switch checked={field.value} onChange={field.onChange} label={t('field_doubtful')} />
          </div>
        )} />
      </form>
    </BottomSheet>
  );
}
