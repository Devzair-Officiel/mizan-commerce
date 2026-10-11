'use client';

import Link from 'next/link';
import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FormRequiredSection } from '@/components/form/FormRequiredSection';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import type { ProductUnit } from '@/lib/hooks/useProducts';
import { ProductTypeChoice } from './ProductTypeChoice';
import { UNITS, type ProductFormValues } from './useProductForm';

const UNIT_NAMES = { piece: 'piece', g: 'gram', kg: 'kilogram', mL: 'milliliter', L: 'liter', m: 'meter' } as const satisfies Record<ProductUnit, string>;

interface ProductIdentitySectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  mode: 'create' | 'edit';
  /** Boutique mixte : choix du type à la création, rappel en lecture seule en modification. */
  mixed: boolean;
  currency: string;
  /** Article à plusieurs formats : prix et unité se règlent sur la fiche. */
  formats?: { count: number; href: string };
}

/** Identité (obligatoire) : type, nom, prix de vente et, pour un article, unité de vente. */
export function ProductIdentitySection({ control, register, errors, mode, mixed, currency, formats }: ProductIdentitySectionProps) {
  const t = useTranslations('articles.form');
  const tUnits = useTranslations('articles.units');
  const [type, unit] = useWatch({ control, name: ['type', 'unit'] });
  const isArticle = type === 'product';
  const priceSuffix = isArticle ? t('price_suffix', { currency, unit: t('unit_short', { unit }) }) : currency;

  return (
    <FormRequiredSection title={t('section_identity')} description={t('section_identity_help', { type })}>
      {mixed && mode === 'create' && <ProductTypeChoice register={register} />}
      {mixed && mode === 'edit' && (
        <p className="col-span-full flex items-center gap-2 text-[0.8125rem] font-medium text-foreground">
          {t('type')}
          <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
            {t(isArticle ? 'type_product' : 'type_service')}
          </span>
        </p>
      )}
      <FormField label={t('name')} required error={errors.name?.message} wide>
        {(c) => <input {...c} {...register('name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      {formats ? (
        <p className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
          <Layers size={16} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">{t('formats_note', { count: formats.count })}</span>
          <Link href={formats.href} className="font-semibold text-primary underline-offset-4 hover:underline">{t('manage_formats')}</Link>
        </p>
      ) : (
        <>
          <FormField label={t('selling_price')} required error={errors.selling_price?.message}>
            {(c) => (
              <FieldSuffix suffix={priceSuffix}>
                <input {...c} {...register('selling_price')} inputMode="decimal" autoComplete="off" className={`${FIELD_CONTROL} pe-24 tabular-nums`} />
              </FieldSuffix>
            )}
          </FormField>
          {isArticle && (
            <FormField label={t('unit')} required={mode === 'create'} help={t('unit_help')} error={errors.unit?.message}>
              {(c) => mode === 'create'
                ? <select {...c} {...register('unit')} className={FIELD_CONTROL}>
                    {UNITS.map((u) => <option key={u} value={u}>{tUnits(UNIT_NAMES[u])}</option>)}
                  </select>
                : <input {...c} readOnly value={tUnits(UNIT_NAMES[unit])} className={`${FIELD_CONTROL} bg-muted text-muted-foreground`} />}
            </FormField>
          )}
        </>
      )}
    </FormRequiredSection>
  );
}
