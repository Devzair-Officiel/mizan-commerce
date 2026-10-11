'use client';

import Link from 'next/link';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import type { ProductType } from '@/lib/hooks/useProducts';
import { ProductTypeChoice } from './ProductTypeChoice';
import type { ProductFormValues } from './useProductForm';

interface ProductInfoSectionProps {
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  mode: 'create' | 'edit';
  /** Boutique mixte : choix du type à la création, rappel non modifiable en modification. */
  mixed: boolean;
  type: ProductType;
  /** Article à plusieurs formats : prix, stock et références se règlent sur la fiche. */
  formats?: { count: number; href: string };
  order: string;
}

/** Informations (obligatoire) : type, nom et description. */
export function ProductInfoSection({ register, errors, mode, mixed, type, formats, order }: ProductInfoSectionProps) {
  const t = useTranslations('articles.form');
  return (
    <FormSection order={order} title={t('section_info')} status="required">
      {mixed && mode === 'create' && <ProductTypeChoice register={register} />}
      {mixed && mode === 'edit' && (
        <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground">
          {t('type')}
          <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
            {t(type === 'product' ? 'type_product' : 'type_service')}
          </span>
        </p>
      )}
      <FormField label={t('name')} required error={errors.name?.message}>
        {(c) => <input {...c} {...register('name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('description')} error={errors.description?.message}>
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
