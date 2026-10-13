'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import {
  RECEIVABLE_CATEGORIES,
  formatMoney,
  type ReceivableBreakdownItem,
  type ReceivableCategory,
} from '@/lib/hooks/useZakat';
import { ReligiousNote } from './ReligiousNote';

interface Step1Props {
  hasReceivables: boolean;
  receivablesNominal: string;
  receivablesBreakdown: ReceivableBreakdownItem[];
  currency: string;
  onChange: (patch: {
    hasReceivables?: boolean;
    receivablesNominal?: string;
    receivablesBreakdown?: ReceivableBreakdownItem[];
  }) => void;
}

function getAmount(breakdown: ReceivableBreakdownItem[], category: ReceivableCategory): string {
  return breakdown.find((b) => b.category === category)?.amount ?? '';
}

function setAmount(
  breakdown: ReceivableBreakdownItem[],
  category: ReceivableCategory,
  amount: string,
): ReceivableBreakdownItem[] {
  const others = breakdown.filter((b) => b.category !== category);
  if (amount === '' || parseFloat(amount) === 0) return others;
  return [...others, { category, amount }];
}

function sumRecoverable(breakdown: ReceivableBreakdownItem[]): number {
  return breakdown
    .filter((b) => b.category !== 'doubtful')
    .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
}

export function Step1Receivables({
  hasReceivables,
  receivablesNominal,
  receivablesBreakdown,
  currency,
  onChange,
}: Step1Props) {
  const t = useTranslations('zakat');
  const recoverable = sumRecoverable(receivablesBreakdown);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Users className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{t('step.receivables.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t.rich('step.receivables.help', {
              b: (chunks: ReactNode) => <strong className="font-medium text-foreground">{chunks}</strong>,
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t('step.receivables.question')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ hasReceivables: false, receivablesBreakdown: [] })}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
              !hasReceivables
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('common.no')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ hasReceivables: true })}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
              hasReceivables
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('common.yes')}
          </button>
        </div>
      </div>

      {hasReceivables && (
        <div className="flex flex-col gap-3">
          <FloatingInput
            id="z-recv-nominal"
            label={t('step.receivables.nominal')}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            suffix={currency}
            value={receivablesNominal}
            onChange={(e) => onChange({ receivablesNominal: e.target.value })}
          />

          <div className="flex flex-col gap-3">
            {RECEIVABLE_CATEGORIES.map((cat) => (
              <div key={cat} className="flex flex-col gap-1">
                <FloatingInput
                  id={`z-recv-${cat}`}
                  label={t(`receivable_category.${cat}`)}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  suffix={currency}
                  value={getAmount(receivablesBreakdown, cat)}
                  onChange={(e) =>
                    onChange({
                      receivablesBreakdown: setAmount(receivablesBreakdown, cat, e.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">{t('step.receivables.total')}</p>
            <p className="text-lg font-semibold text-primary tabular-nums">
              {formatMoney(recoverable, currency)}
            </p>
          </div>
        </div>
      )}

      <ReligiousNote rubric="receivables" />
    </div>
  );
}
