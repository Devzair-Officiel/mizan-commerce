'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { ProductFormValues } from './useProductForm';

interface ProductPriceSectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  /** Symbole affiché dans les champs (« € »). */
  currency: string;
  /** Code de devise de la boutique (formatage de la marge). */
  currencyCode: string;
  order: string;
}

/** Montant saisi (« 12,50 ») ou `null` s'il est vide ou illisible. */
function amount(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() && Number.isFinite(n) ? n : null;
}

/** Marge par unité vendue, en pourcentage du prix de vente ; `null` tant qu'un des deux prix manque. */
function margin(selling: number | null, purchase: number | null) {
  return selling && purchase !== null ? { rate: ((selling - purchase) / selling) * 100, amount: selling - purchase } : null;
}

/** Prix : prix de vente, et pour un article prix d'achat et marge mise à jour pendant la saisie. */
export function ProductPriceSection({ control, register, errors, currency, currencyCode, order }: ProductPriceSectionProps) {
  const t = useTranslations('articles.form');
  const formatMoney = useFormatMoney();
  const formatNumber = useFormatNumber();
  const [type, unit, sellingRaw, purchaseRaw] = useWatch({ control, name: ['type', 'unit', 'selling_price', 'purchase_price'] });
  const isArticle = type === 'product';
  const suffix = isArticle ? t('price_suffix', { currency, unit: t('unit_short', { unit }) }) : currency;
  const result = isArticle ? margin(amount(sellingRaw), amount(purchaseRaw)) : null;
  const loss = result !== null && result.amount < 0;
  const priceClass = `${FIELD_CONTROL} ${isArticle ? 'pe-24' : 'pe-10'} tabular-nums`;

  return (
    <FormSection icon={Wallet} order={order} title={t('section_price')}>
      <div className={FIELD_ROW}>
        <FormField label={t('selling_price')} required error={errors.selling_price?.message}>
          {(c) => <FieldSuffix suffix={suffix}><input {...c} {...register('selling_price')} inputMode="decimal" autoComplete="off" className={priceClass} /></FieldSuffix>}
        </FormField>
        {isArticle && (
          <FormField label={t('purchase_price')} help={t('purchase_help')} error={errors.purchase_price?.message}>
            {(c) => <FieldSuffix suffix={suffix}><input {...c} {...register('purchase_price')} inputMode="decimal" autoComplete="off" className={priceClass} /></FieldSuffix>}
          </FormField>
        )}
      </div>
      {result && (
        <p className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3.5 py-3 text-sm ${loss ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
          <span className={`font-bold ${loss ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
            {t('margin_rate', { margin: formatNumber(result.rate, { maximumFractionDigits: 0 }) })}
          </span>
          <span className="text-foreground">{t('margin_amount', { amount: formatMoney(result.amount, currencyCode), unit })}</span>
        </p>
      )}
    </FormSection>
  );
}
