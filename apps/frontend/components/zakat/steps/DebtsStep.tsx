'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { compareDecimal } from '@/lib/decimal';
import type { DebtLine } from '@/lib/hooks/useZakat';
import { CalcChoice } from '../choice/CalcChoice';
import { DebtListCard } from './debts/DebtListCard';
import { DebtSheet } from './debts/DebtSheet';
import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

/** Étape 6 : quelles dettes déduire (divergence), puis les dettes au jour J avec leur part due dans les 12 mois. */
export function DebtsStep({ calc, save, format }: StepProps) {
  const t = useTranslations('zakat.choice.debts_mode');
  const [sheet, setSheet] = useState<number | 'new' | null>(null);
  const debts = calc.debt_items;
  const { totals } = calc;
  // Sous 100 %, chaque dette se classe : boutique ou personnelle.
  const share = compareDecimal(totals.ownership_share, '100') < 0 ? format.percent(totals.ownership_share) : undefined;
  const write = (next: DebtLine[]) => save({ debt_items: next }, true);
  const replace = (index: number, debt: DebtLine) => write(debts.map((d, i) => (i === index ? debt : d)));
  const remove = (index: number) => write(debts.filter((_, i) => i !== index));
  // Montants des options : totaux du serveur, « − » devant ce qui serait retiré de la base.
  // Sans montant tant qu'une portée reste à choisir.
  const minus = (value: string | null) => (value === null ? undefined : format.minus(value));
  const amounts = {
    all: minus(totals.debts_total),
    within_12_months: minus(totals.debts_within_12_months),
    none: format.money('0'),
  };

  return (
    <>
      <StepHeading title={t('question')} lead={t('hint')} />
      <CalcChoice calc={calc} save={save} format={format} name="debts_mode" amounts={amounts} amountPlacement="trailing" questionIsHeading />
      <DebtListCard calc={calc} format={format} onEdit={setSheet} onAdd={() => setSheet('new')} />
      {sheet !== null && (
        <DebtSheet debt={sheet === 'new' ? undefined : debts[sheet]} format={format} share={share} onClose={() => setSheet(null)}
          onSubmit={(debt) => (sheet === 'new' ? write([...debts, debt]) : replace(sheet, debt))}
          onDelete={sheet === 'new' ? undefined : () => { remove(sheet); setSheet(null); }} />
      )}
    </>
  );
}
