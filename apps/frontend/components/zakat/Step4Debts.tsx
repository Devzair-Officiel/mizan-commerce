'use client';

import { Receipt, Plus, Trash2 } from 'lucide-react';
import {
  FloatingInput,
  FloatingSelect,
} from '@/components/ui/floating-fields';
import {
  DEBT_CATEGORY_LABELS,
  formatMoney,
  sumImmediateDebts,
  type DebtCategory,
  type DebtItem,
} from '@/lib/hooks/useZakat';
import { ReligiousNote } from './ReligiousNote';

interface Step4Props {
  debts: DebtItem[];
  currency: string;
  onChange: (patch: { debtsBreakdown: DebtItem[] }) => void;
}

const CATEGORIES = Object.keys(DEBT_CATEGORY_LABELS) as DebtCategory[];

function makeEmptyDebt(): DebtItem {
  return { category: 'supplier', label: '', amount: '', is_immediately_due: true };
}

export function Step4Debts({ debts, currency, onChange }: Step4Props) {
  const updateDebt = (index: number, patch: Partial<DebtItem>) => {
    const next = debts.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange({ debtsBreakdown: next });
  };

  const addDebt = () => onChange({ debtsBreakdown: [...debts, makeEmptyDebt()] });

  const removeDebt = (index: number) =>
    onChange({ debtsBreakdown: debts.filter((_, i) => i !== index) });

  const immediateTotal = sumImmediateDebts(debts);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Receipt className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Dettes à court terme</p>
          <p className="text-xs text-muted-foreground">
            Seules les dettes <strong className="font-medium text-foreground">exigibles immédiatement</strong>
            {' '}sont déduites. Un emprunt sur 5 ans, par exemple, n'est exigible immédiatement que
            pour les mensualités du mois.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {debts.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Aucune dette renseignée — appuyez sur «&nbsp;Ajouter une dette&nbsp;» si vous en avez.
          </p>
        )}

        {debts.map((debt, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 flex flex-col gap-2">
                <FloatingSelect
                  id={`z-debt-${index}-cat`}
                  label="Catégorie"
                  value={debt.category}
                  onChange={(e) =>
                    updateDebt(index, { category: e.target.value as DebtCategory })
                  }
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {DEBT_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </FloatingSelect>
                <FloatingInput
                  id={`z-debt-${index}-label`}
                  label="Libellé"
                  type="text"
                  value={debt.label}
                  onChange={(e) => updateDebt(index, { label: e.target.value })}
                />
                <FloatingInput
                  id={`z-debt-${index}-amount`}
                  label="Montant"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  suffix={currency}
                  value={debt.amount}
                  onChange={(e) => updateDebt(index, { amount: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeDebt(index)}
                className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Supprimer cette dette"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Toggle exigibilité — la nuance la plus importante de cette étape */}
            <div className="flex items-center gap-2 px-1">
              <p className="flex-1 text-xs text-muted-foreground">Exigible immédiatement&nbsp;?</p>
              <button
                type="button"
                onClick={() => updateDebt(index, { is_immediately_due: false })}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  !debt.is_immediately_due
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Non
              </button>
              <button
                type="button"
                onClick={() => updateDebt(index, { is_immediately_due: true })}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  debt.is_immediately_due
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Oui
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addDebt}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <Plus size={16} />
          Ajouter une dette
        </button>
      </div>

      {debts.length > 0 && (
        <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">Total déductible (exigible immédiatement)</p>
          <p className="text-lg font-semibold text-primary tabular-nums">
            {formatMoney(immediateTotal, currency)}
          </p>
        </div>
      )}

      <ReligiousNote rubric="debts" />
    </div>
  );
}
