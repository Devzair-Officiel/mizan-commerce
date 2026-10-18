'use client';

import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Switch } from '@/components/ui/Switch';
import type { OtherAsset } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';
import { SheetActions } from '../SheetActions';
import { ASSET_KINDS, assetFormValues, assetOf, assetSchema, type AssetFormValues, type AssetKind } from './assetForm';
import { MetalFields } from './MetalFields';

interface AssetSheetProps {
  asset?: OtherAsset;
  /** Catégorie du raccourci touché, pour un ajout. */
  kind: AssetKind;
  format: ZakatFormat;
  onClose: () => void;
  onSubmit: (asset: OtherAsset) => void;
  onDelete?: () => void;
}

/** Bien hors boutique : catégorie, description, valeur au jour J, compté ou non. */
export function AssetSheet({ asset, kind, format, onClose, onSubmit, onDelete }: AssetSheetProps) {
  const t = useTranslations('zakat');
  const formId = useId();
  const schema = assetSchema({
    label: t('common.label_required'), amount: t('common.amount_invalid'),
    metal: t('steps.other.metal_required'), jewelry: t('steps.other.jewelry_required'),
  });
  const { register, control, setValue, handleSubmit, formState: { errors } } = useForm<AssetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: assetFormValues(asset, kind, t(`asset_category.${kind}`), format.amountInput),
  });
  const [currentKind, metal, counted] = useWatch({ control, name: ['kind', 'metal', 'counted'] });
  const submit = handleSubmit((values) => { onSubmit(assetOf(values)); onClose(); });

  function changeKind(next: AssetKind) {
    setValue('kind', next);
    setValue('metal', null);
    setValue('counted', next === 'gold_silver' ? null : true);
  }

  return (
    <BottomSheet open onClose={onClose} title={t(asset ? 'steps.other.sheet_edit' : 'steps.other.sheet_add')}
      footer={<SheetActions formId={formId} submitLabel={t(asset ? 'common.save' : 'common.add')} onCancel={onClose}
        onDelete={onDelete} deleteLabel={t('steps.other.delete_line')} />}>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label={t('steps.other.field_category')} required>
          {(c) => <FormSelect control={c} value={currentKind} onChange={changeKind}
            options={ASSET_KINDS.map((k) => ({ value: k, label: t(`asset_category.${k}`) }))} />}
        </FormField>
        {currentKind === 'gold_silver' && (
          <MetalFields metal={metal} counted={counted} errors={{ metal: errors.metal?.message, counted: errors.counted?.message }}
            onMetal={(next) => { setValue('metal', next, { shouldValidate: true }); setValue('counted', next === 'bullion' ? true : null); }}
            onCounted={(next) => setValue('counted', next, { shouldValidate: true })} />
        )}
        <FormField label={t('steps.other.field_label')} required error={errors.label?.message}>
          {(c) => <input {...c} {...register('label')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('steps.other.field_amount')} required error={errors.amount?.message}>
          {(c) => (
            <FieldSuffix suffix={format.symbol}>
              <input {...c} {...register('amount')} inputMode="decimal" autoComplete="off" placeholder="0,00" className={`${FIELD_CONTROL} pe-14 tabular-nums`} />
            </FieldSuffix>
          )}
        </FormField>
        {!(currentKind === 'gold_silver' && metal !== 'bullion') && (
          <Controller control={control} name="counted" render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{t('steps.other.field_counted')}</p>
              <Switch checked={field.value ?? true} onChange={field.onChange} label={t('steps.other.field_counted')} />
            </div>
          )} />
        )}
      </form>
    </BottomSheet>
  );
}
