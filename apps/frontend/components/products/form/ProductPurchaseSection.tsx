'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { ProductFormValues } from './useProductForm';

interface ProductPurchaseSectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  currency: string;
  /** Code de devise de la boutique (formatage du résumé). */
  currencyCode: string;
  open: boolean;
  onToggle: () => void;
}

/** Montant saisi (« 12,50 ») ou `null` s'il est vide ou illisible. */
function amount(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() && Number.isFinite(n) ? n : null;
}

/** Prix d'achat (facultatif) et marge sur le prix de vente, calculée pendant la saisie. */
export function ProductPurchaseSection({ control, register, errors, currency, currencyCode, open, onToggle }: ProductPurchaseSectionProps) {
  const t = useTranslations('articles.form');
  const formatMoney = useFormatMoney();
  const formatNumber = useFormatNumber();
  const [purchaseRaw, sellingRaw, unit] = useWatch({ control, name: ['purchase_price', 'selling_price', 'unit'] });
  const purchase = amount(purchaseRaw);
  const selling = amount(sellingRaw);
  const margin = purchase !== null && selling ? formatNumber(((selling - purchase) / selling) * 100, { maximumFractionDigits: 0 }) : null;
  const price = purchase !== null ? formatMoney(purchase, currencyCode) : '';
  const summary = !price ? '' : margin !== null ? t('purchase_summary', { price, margin }) : t('purchase_summary_no_margin', { price });

  return (
    <FormCollapsibleSection title={t('section_purchase')} description={t('section_purchase_help')} summary={summary}
      icon={<Wallet size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
      <FormField label={t('purchase_price')} error={errors.purchase_price?.message}>
        {(c) => (
          <FieldSuffix suffix={t('price_suffix', { currency, unit: t('unit_short', { unit }) })}>
            <input {...c} {...register('purchase_price')} inputMode="decimal" autoComplete="off" className={`${FIELD_CONTROL} pe-24 tabular-nums`} />
          </FieldSuffix>
        )}
      </FormField>
      <FormField label={t('margin')} help={t('margin_help')}>
        {(c) => <output {...c} className={`${FIELD_CONTROL} flex items-center bg-muted tabular-nums`}>{margin !== null ? t('margin_value', { margin }) : '—'}</output>}
      </FormField>
    </FormCollapsibleSection>
  );
}
