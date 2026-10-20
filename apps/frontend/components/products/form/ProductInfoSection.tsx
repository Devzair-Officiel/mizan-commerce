'use client';

import Link from 'next/link';
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Layers, Tag } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_CONTROL, FIELD_READONLY, FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import type { ProductType } from '@/lib/hooks/useProducts';
import { DetectedBadge } from './DetectedBadge';
import { ProductTypeChoice } from './ProductTypeChoice';
import { UNIT_NAMES, UNITS, type ProductFormValues } from './productFormSchema';
import type { ScanProposals } from './productScanPrefill';

interface ProductInfoSectionProps {
  register: UseFormRegister<ProductFormValues>;
  control: Control<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  mode: 'create' | 'edit';
  /** Boutique mixte : choix du type à la création, rappel non modifiable en modification. */
  mixed: boolean;
  type: ProductType;
  /** Article à plusieurs formats : l'unité est commune à tous. */
  multi: boolean;
  /** Service à plusieurs formats : prix, stock et références se règlent sur la fiche. */
  formats?: { count: number; href: string };
  order: string;
  /** Valeurs posées par le scan d'emballage : badge « Détecté, à vérifier » sur ces champs. */
  detected?: ScanProposals;
}

/**
 * Informations (obligatoire) : type, nom, unité de vente (article : choisie à la création puis
 * définitive, avant les prix et le stock qui s'expriment dans cette unité) et description.
 */
export function ProductInfoSection({ register, control, errors, mode, mixed, type, multi, formats, order, detected = {} }: ProductInfoSectionProps) {
  const t = useTranslations('articles.form');
  const tUnits = useTranslations('articles.units');
  const options = UNITS.map((u) => ({ value: u, label: tUnits(UNIT_NAMES[u]) }));
  return (
    <FormSection icon={Tag} order={order} title={t('section_info')} status="required">
      {mixed && mode === 'create' && <ProductTypeChoice register={register} />}
      {mixed && mode === 'edit' && (
        <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground">
          {t('type')}
          <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
            {t(type === 'product' ? 'type_product' : 'type_service')}
          </span>
        </p>
      )}
      <FormField label={t('name')} required error={errors.name?.message} badge={<DetectedBadge control={control} name="name" value={detected.name} />}>
        {(c) => <input {...c} {...register('name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      {type === 'product' && (
        <FormField label={t('unit')} required={mode === 'create'} help={t(multi ? 'unit_help_formats' : 'unit_help')}
          badge={<DetectedBadge control={control} name="unit" value={detected.unit} />}>
          {(c) => <Controller control={control} name="unit" render={({ field }) => mode === 'create'
            ? <FormSelect control={c} value={field.value} onChange={field.onChange} options={options} triggerRef={field.ref} />
            : <output {...c} className={`${FIELD_READONLY} text-muted-foreground`}>{tUnits(UNIT_NAMES[field.value])}</output>} />}
        </FormField>
      )}
      <FormField label={t('description')} error={errors.description?.message} badge={<DetectedBadge control={control} name="description" value={detected.description} />}>
        {(c) => <textarea {...c} {...register('description')} dir="auto" rows={3} className={FIELD_TEXTAREA} />}
      </FormField>
      {formats && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
          <Layers size={16} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">{t('formats_note', { count: formats.count })}</span>
          <Link href={formats.href} className="font-semibold text-primary underline-offset-4 hover:underline">{t('manage_formats')}</Link>
        </p>
      )}
    </FormSection>
  );
}
