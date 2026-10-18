'use client';

import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { DebtLine } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';
import { SheetActions } from '../SheetActions';
import { DEBT_CATEGORIES, WITHIN, debtFormValues, debtOf, debtSchema, type DebtFormValues } from './debtForm';

interface DebtSheetProps {
  debt?: DebtLine;
  format: ZakatFormat;
  onClose: () => void;
  onSubmit: (debt: DebtLine) => void;
  onDelete?: () => void;
}

const AMOUNT_INPUT = `${FIELD_CONTROL} pe-14 tabular-nums`;

/** Dette au jour J : catégorie, description, reste dû et part à régler dans les 12 mois. */
export function DebtSheet({ debt, format, onClose, onSubmit, onDelete }: DebtSheetProps) {
  const t = useTranslations('zakat');
  const formId = useId();
  const schema = debtSchema({ label: t('common.label_required'), amount: t('common.amount_invalid'), tooHigh: t('steps.debts.within_too_high') });
  const { register, control, setValue, handleSubmit, formState: { errors } } = useForm<DebtFormValues>({
    resolver: zodResolver(schema),
    defaultValues: debtFormValues(debt, format.amountInput),
  });
  const [category, within] = useWatch({ control, name: ['category', 'within'] });
  const submit = handleSubmit((values) => { onSubmit(debtOf(values)); onClose(); });

  return (
    <BottomSheet open onClose={onClose} title={t(debt ? 'steps.debts.sheet_edit' : 'steps.debts.sheet_add')}
      footer={<SheetActions formId={formId} submitLabel={t(debt ? 'common.save' : 'common.add')} onCancel={onClose}
        onDelete={onDelete} deleteLabel={t('steps.debts.delete_line')} />}>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label={t('steps.debts.field_category')} required>
          {(c) => <FormSelect control={c} value={category} onChange={(next) => setValue('category', next)}
            options={DEBT_CATEGORIES.map((k) => ({ value: k, label: t(`debt_category.${k}`) }))} />}
        </FormField>
        <FormField label={t('steps.debts.field_label')} required error={errors.label?.message}>
          {(c) => <input {...c} {...register('label')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('steps.debts.field_amount')} required error={errors.amount?.message}>
          {(c) => (
            <FieldSuffix suffix={format.symbol}>
              <input {...c} {...register('amount')} inputMode="decimal" autoComplete="off" placeholder="0,00" className={AMOUNT_INPUT} />
            </FieldSuffix>
          )}
        </FormField>
        <FormField label={t('steps.debts.field_within')} required>
          {(c) => <FormSelect control={c} value={within} onChange={(next) => setValue('within', next)}
            options={WITHIN.map((k) => ({ value: k, label: t(`steps.debts.within.${k}`) }))} />}
        </FormField>
        {within === 'partial' && (
          <FormField label={t('steps.debts.field_within_amount')} required error={errors.withinAmount?.message}>
            {(c) => (
              <FieldSuffix suffix={format.symbol}>
                <input {...c} {...register('withinAmount')} inputMode="decimal" autoComplete="off" placeholder="0,00" className={AMOUNT_INPUT} />
              </FieldSuffix>
            )}
          </FormField>
        )}
      </form>
    </BottomSheet>
  );
}
