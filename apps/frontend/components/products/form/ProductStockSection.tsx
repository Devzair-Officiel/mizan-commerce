'use client';

import Link from 'next/link';
import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ArrowDownToLine } from 'lucide-react';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_READONLY, FIELD_ROW } from '@/components/form/fieldStyles';
import { useFormatNumber } from '@/lib/hooks/useFormat';
import type { ProductFormValues } from './useProductForm';

interface ProductStockSectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  /** En modification : stock actuel (lecture seule) et lien vers l'entrée de stock. */
  current?: { quantity: string; stockInHref: string };
  open: boolean;
  onToggle: () => void;
  order: string;
}

/** Stock (facultatif, article) : stock initial à la création, stock actuel ensuite, et seuil d'alerte. */
export function ProductStockSection({ control, register, errors, current, open, onToggle, order }: ProductStockSectionProps) {
  const t = useTranslations('articles.form');
  const formatNumber = useFormatNumber();
  const [initial, threshold, unit] = useWatch({ control, name: ['initial_stock', 'low_stock_threshold', 'unit'] });
  const suffix = t('unit_short', { unit });
  const show = (value: string) => {
    const n = Number(value.trim().replace(',', '.'));
    if (!value.trim() || !Number.isFinite(n)) return '';
    return `${formatNumber(n, { maximumFractionDigits: 3 })}${unit === 'piece' ? '' : ` ${unit}`}`;
  };
  const stock = show(current?.quantity ?? initial);
  const alert = show(threshold);
  const summary = stock && alert ? t('stock_summary_both', { stock, threshold: alert })
    : stock ? t('stock_summary_stock', { stock }) : alert ? t('stock_summary_threshold', { threshold: alert }) : '';
  const quantityClass = `${FIELD_CONTROL} pe-20 tabular-nums`;

  return (
    <FormSection order={order} title={t('section_stock')} status="optional" collapse={{ open, onToggle, summary }}>
      <div className={FIELD_ROW}>
        {current ? (
          <FormField label={t('current_stock')}>
            {(c) => (
              <div className="flex flex-col gap-1.5">
                <output {...c} className={`${FIELD_READONLY} tabular-nums`}>{stock || '0'}</output>
                <Link href={current.stockInHref} className="inline-flex items-center gap-1.5 self-start text-[0.8125rem] font-semibold text-primary underline-offset-4 hover:underline">
                  <ArrowDownToLine size={14} aria-hidden />
                  {t('stock_in_link')}
                </Link>
              </div>
            )}
          </FormField>
        ) : (
          <FormField label={t('initial_stock')} help={t('initial_stock_help')} error={errors.initial_stock?.message}>
            {(c) => (
              <FieldSuffix suffix={suffix}>
                <input {...c} {...register('initial_stock')} inputMode="decimal" autoComplete="off" className={quantityClass} />
              </FieldSuffix>
            )}
          </FormField>
        )}
        <FormField label={t('threshold')} help={t('threshold_help')} error={errors.low_stock_threshold?.message}>
          {(c) => (
            <FieldSuffix suffix={suffix}>
              <input {...c} {...register('low_stock_threshold')} inputMode="decimal" autoComplete="off" className={quantityClass} />
            </FieldSuffix>
          )}
        </FormField>
      </div>
    </FormSection>
  );
}
