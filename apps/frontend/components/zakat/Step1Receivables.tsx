'use client';

import { Users } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import {
  RECEIVABLE_CATEGORY_LABELS,
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

const CATEGORIES: ReceivableCategory[] = ['certain', 'probable', 'doubtful'];

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
  const recoverable = sumRecoverable(receivablesBreakdown);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Users className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Argent que vos clients vous doivent</p>
          <p className="text-xs text-muted-foreground">
            Ventes à crédit, factures impayées, ardoises… On distingue trois niveaux selon la
            probabilité de recouvrement. Seules les <strong className="font-medium text-foreground">
            certaines</strong> et <strong className="font-medium text-foreground">probables</strong>
            {' '}entrent dans la zakat.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          Vos clients vous doivent-ils de l&apos;argent&nbsp;?
        </p>
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
            Non
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
            Oui
          </button>
        </div>
      </div>

      {hasReceivables && (
        <div className="flex flex-col gap-3">
          <FloatingInput
            id="z-recv-nominal"
            label="Montant total dû (nominal)"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            suffix={currency}
            value={receivablesNominal}
            onChange={(e) => onChange({ receivablesNominal: e.target.value })}
          />

          <div className="flex flex-col gap-3">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="flex flex-col gap-1">
                <FloatingInput
                  id={`z-recv-${cat}`}
                  label={RECEIVABLE_CATEGORY_LABELS[cat]}
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
            <p className="text-xs text-muted-foreground">Total zakatable (certaines + probables)</p>
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
