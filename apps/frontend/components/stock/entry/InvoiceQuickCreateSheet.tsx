'use client';

import { useId } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { amount, margin, marginBox } from '@/components/products/form/margin';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { PickedVariant } from './InvoiceLinePickerSheet';
import { currencySymbol } from './stockEntryLineTypes';
import { useInvoiceQuickCreate, type InvoiceQuickCreateValues } from './useInvoiceQuickCreate';

interface InvoiceQuickCreateSheetProps {
  readLabel: string;
  /** Prix d'achat de la ligne lue (« 4.50 »), vide s'il n'a pas été lu. */
  purchasePrice: string;
  currencyCode: string;
  onCreated: (picked: PickedVariant) => void;
  onClose: () => void;
}

/** Marge par pièce, mise à jour pendant la saisie des prix. */
function QuickCreateMargin({ control, currencyCode }: { control: Control<InvoiceQuickCreateValues>; currencyCode: string }) {
  const t = useTranslations('articles.form');
  const formatMoney = useFormatMoney();
  const formatNumber = useFormatNumber();
  const [selling, purchase] = useWatch({ control, name: ['selling_price', 'purchase_price'] });
  const result = margin(amount(selling), amount(purchase));
  if (!result) return null;
  const style = marginBox(result.amount < 0);
  return (
    <p role="status" className={style.box}>
      <span className={style.rate}>{t('margin_rate', { margin: formatNumber(result.rate, { maximumFractionDigits: 0 }) })}</span>
      <span className="text-foreground">{t('margin_amount', { amount: formatMoney(result.amount, currencyCode), unit: 'piece' })}</span>
    </p>
  );
}

/**
 * « Créer cet article » : création rapide préremplie depuis la ligne lue (fenêtre du bas sur mobile).
 * L'article et son format sont créés ensemble ; la ligne lui est ensuite associée.
 */
export function InvoiceQuickCreateSheet({ readLabel, purchasePrice, currencyCode, onCreated, onClose }: InvoiceQuickCreateSheetProps) {
  const t = useTranslations('articles.form');
  const ti = useTranslations('stock.invoice');
  const tc = useTranslations('stock.common');
  const formId = useId();
  const { form, submit, pending } = useInvoiceQuickCreate(readLabel, purchasePrice, onCreated);
  const { errors } = form.formState;
  const suffix = t('price_suffix', { currency: currencySymbol(currencyCode), unit: t('unit_short', { unit: 'piece' }) });
  const priceClass = `${FIELD_CONTROL} pe-24 tabular-nums`;

  return (
    <BottomSheet open onClose={onClose} title={ti('create_title')} description={ti('picker_read', { label: readLabel })} footer={
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4">{tc('cancel')}</Button>
        <Button type="submit" form={formId} disabled={pending} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">
          {ti('create_submit')}
        </Button>
      </div>
    }>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4 pb-2">
        <FormField label={t('name')} required error={errors.name?.message}>
          {(c) => <input {...c} {...form.register('name')} autoComplete="off" dir="auto" className={FIELD_CONTROL} />}
        </FormField>
        <div className={FIELD_ROW}>
          <FormField label={t('selling_price')} required error={errors.selling_price?.message}>
            {(c) => <FieldSuffix suffix={suffix}><input {...c} {...form.register('selling_price')} inputMode="decimal" autoComplete="off" autoFocus className={priceClass} /></FieldSuffix>}
          </FormField>
          <FormField label={t('purchase_price')} help={ti('create_purchase_help')} error={errors.purchase_price?.message}>
            {(c) => <FieldSuffix suffix={suffix}><input {...c} {...form.register('purchase_price')} inputMode="decimal" autoComplete="off" className={priceClass} /></FieldSuffix>}
          </FormField>
        </div>
        <QuickCreateMargin control={form.control} currencyCode={currencyCode} />
        <p className="text-xs text-muted-foreground">{ti('create_note')}</p>
      </form>
    </BottomSheet>
  );
}
