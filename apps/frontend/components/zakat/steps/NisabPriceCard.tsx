'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { NisabMethod } from '@/lib/hooks/useZakat';
import { AMOUNT_PATTERN, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import type { ZakatFormat } from '../useZakatFormat';
import { AmountField } from './AmountField';

interface NisabPriceCardProps {
  metal: NisabMethod | null;
  price: string | null;
  /** Seuil calculé par le serveur ; `null` sans prix. */
  threshold: string | null;
  format: ZakatFormat;
  onSave: (price: string) => void;
  /** Sous le seuil : ancienneté du prix (réglages). */
  children?: ReactNode;
}

/** Prix du gramme du métal choisi : sans lui, pas de seuil ; le seuil calculé par le serveur s'affiche dessous. */
export function NisabPriceCard({ metal, price, threshold, format, onSave, children }: NisabPriceCardProps) {
  const t = useTranslations('zakat.steps.hawl');
  const tc = useTranslations('zakat');
  if (!metal) return null;
  const valid = (value: string) => AMOUNT_PATTERN.test(value) && !isZeroDecimal(normalizeDecimal(value));

  return (
    <SectionCard title={tc('summary.label.nisab_method')} description={tc('common.nisab_name', { method: metal })}>
      <div className="flex flex-col gap-3 p-5">
        <AmountField label={t('price_label', { metal })} help={t('price_help')} suffix={format.symbol}
          initial={price ? format.amountInput(price) : ''}
          pattern={{ test: valid, message: t('price_invalid') }}
          onSave={onSave} />
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {threshold === null ? tc('common.price_missing') : t('threshold_value', { amount: format.money(threshold) })}
        </p>
        {children}
      </div>
    </SectionCard>
  );
}
