'use client';

import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import { ReligiousNote } from './ReligiousNote';

interface Step0Props {
  referenceDate: string;
  cashAmount: string;
  currency: string;
  onChange: (patch: { referenceDate?: string; cashAmount?: string }) => void;
}

export function Step0Liquidity({ referenceDate, cashAmount, currency, onChange }: Step0Props) {
  const t = useTranslations('zakat');
  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau pédagogique : pose le contexte de la question. */}
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Wallet className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{t('step.cash.title')}</p>
          <p className="text-xs text-muted-foreground">{t('step.cash.help')}</p>
        </div>
      </div>

      <FloatingInput
        id="z-ref-date"
        label={t('step.cash.reference_date')}
        type="date"
        value={referenceDate}
        onChange={(e) => onChange({ referenceDate: e.target.value })}
      />

      <FloatingInput
        id="z-cash"
        label={t('common.cash')}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        suffix={currency}
        value={cashAmount}
        onChange={(e) => onChange({ cashAmount: e.target.value })}
      />

      <ReligiousNote rubric="cash" />
    </div>
  );
}
