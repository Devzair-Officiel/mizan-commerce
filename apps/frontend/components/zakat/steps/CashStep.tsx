'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { AmountField } from './AmountField';
import type { StepProps } from './types';

/** Étape 2 : caisse et banque de la boutique au jour J, un seul montant. */
export function CashStep({ calc, save, format }: StepProps) {
  const t = useTranslations('zakat.steps.cash');
  return (
    <SectionCard title={t('title')} description={t('hint')}>
      <div className="p-5">
        <AmountField label={t('label')} help={t('help')} suffix={format.symbol}
          initial={format.amountInput(calc.cash_amount)} onSave={(amount) => save({ cash_amount: amount })} />
      </div>
    </SectionCard>
  );
}
