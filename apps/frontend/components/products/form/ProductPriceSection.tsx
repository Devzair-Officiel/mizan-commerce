'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Plus, Wallet } from 'lucide-react';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_ROW, HEADER_LINK } from '@/components/form/fieldStyles';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import { amount, margin, marginBox } from './margin';
import type { ProductFormValues } from './productFormSchema';

interface ProductPriceSectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  /** Symbole affiché dans les champs (« € »). */
  currency: string;
  /** Code de devise de la boutique (formatage de la marge). */
  currencyCode: string;
  /** Article : « Plusieurs formats » remplace les cartes Prix et Stock par le tableau des formats. */
  onMultiple?: () => void;
  order: string;
}

/** Prix : prix de vente, et pour un article prix d'achat et marge mise à jour pendant la saisie. */
export function ProductPriceSection({ control, register, errors, currency, currencyCode, onMultiple, order }: ProductPriceSectionProps) {
  const t = useTranslations('articles.form');
  const formatMoney = useFormatMoney();
  const formatNumber = useFormatNumber();
  const [type, unit, sellingRaw, purchaseRaw] = useWatch({ control, name: ['type', 'unit', 'formats.0.selling_price', 'formats.0.purchase_price'] });
  const isArticle = type === 'product';
  const suffix = isArticle ? t('price_suffix', { currency, unit: t('unit_short', { unit }) }) : currency;
  const result = isArticle ? margin(amount(sellingRaw), amount(purchaseRaw)) : null;
  const loss = result !== null && result.amount < 0;
  const priceClass = `${FIELD_CONTROL} ${isArticle ? 'pe-24' : 'pe-10'} tabular-nums`;

  return (
    <FormSection icon={Wallet} order={order} title={t('section_price')} action={isArticle && onMultiple && (
      <button type="button" onClick={onMultiple} className={HEADER_LINK}>
        <Plus size={14} aria-hidden />
        {t('formats_multiple')}
      </button>
    )}>
      <div className={FIELD_ROW}>
        <FormField label={t('selling_price')} required error={errors.formats?.[0]?.selling_price?.message}>
          {(c) => <FieldSuffix suffix={suffix}><input {...c} {...register('formats.0.selling_price')} inputMode="decimal" autoComplete="off" className={priceClass} /></FieldSuffix>}
        </FormField>
        {isArticle && (
          <FormField label={t('purchase_price')} help={t('purchase_help')} error={errors.formats?.[0]?.purchase_price?.message}>
            {(c) => <FieldSuffix suffix={suffix}><input {...c} {...register('formats.0.purchase_price')} inputMode="decimal" autoComplete="off" className={priceClass} /></FieldSuffix>}
          </FormField>
        )}
      </div>
      {result && (
        <p className={marginBox(loss).box}>
          <span className={marginBox(loss).rate}>
            {t('margin_rate', { margin: formatNumber(result.rate, { maximumFractionDigits: 0 }) })}
          </span>
          <span className="text-foreground">{t('margin_amount', { amount: formatMoney(result.amount, currencyCode), unit })}</span>
        </p>
      )}
    </FormSection>
  );
}
