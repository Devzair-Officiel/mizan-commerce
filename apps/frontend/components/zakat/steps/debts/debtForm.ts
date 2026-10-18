import { z } from 'zod';
import { AMOUNT_PATTERN, compareDecimal, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import type { DebtCategory, DebtLine, DebtsMode } from '@/lib/hooks/useZakat';

export const DEBT_CATEGORIES = ['supplier', 'tax_vat', 'salary', 'loan', 'rent', 'other'] as const satisfies readonly DebtCategory[];
export const WITHIN = ['yes', 'partial', 'no'] as const;
export type Within = (typeof WITHIN)[number];

/** Dû dans les 12 mois : en entier, en partie ou pas du tout (comparaison des montants saisis, aucun calcul). */
export function withinOf(debt: DebtLine): Within {
  if (isZeroDecimal(debt.amount_within_12_months)) return 'no';
  return compareDecimal(debt.amount_within_12_months, debt.amount) >= 0 ? 'yes' : 'partial';
}

/** Montant déduit de la ligne selon le choix : l'un des montants saisis, nul si aucune dette n'est déduite. */
export function deductedOf(debt: DebtLine, mode: DebtsMode | null): string | null {
  if (mode === null) return null;
  if (mode === 'none') return '0';
  return mode === 'all' ? debt.amount : debt.amount_within_12_months;
}

interface DebtMessages {
  label: string;
  amount: string;
  tooHigh: string;
}

const isAmount = (v: string) => AMOUNT_PATTERN.test(v) && !isZeroDecimal(normalizeDecimal(v));

export function debtSchema(messages: DebtMessages) {
  return z.object({
    category: z.enum(DEBT_CATEGORIES),
    label: z.string().trim().min(1, messages.label).max(200),
    amount: z.string().trim().refine(isAmount, messages.amount),
    within: z.enum(WITHIN),
    withinAmount: z.string().trim(),
  }).superRefine((v, ctx) => {
    if (v.within !== 'partial') return;
    if (!isAmount(v.withinAmount)) ctx.addIssue({ code: 'custom', path: ['withinAmount'], message: messages.amount });
    else if (isAmount(v.amount) && compareDecimal(v.withinAmount, v.amount) > 0) {
      ctx.addIssue({ code: 'custom', path: ['withinAmount'], message: messages.tooHigh });
    }
  });
}

export type DebtFormValues = z.infer<ReturnType<typeof debtSchema>>;

export function debtFormValues(debt: DebtLine | undefined, amountInput: (v: string) => string): DebtFormValues {
  if (!debt) return { category: 'supplier', label: '', amount: '', within: 'yes', withinAmount: '' };
  const within = withinOf(debt);
  return {
    category: debt.category,
    label: debt.label,
    amount: amountInput(debt.amount),
    within,
    withinAmount: within === 'partial' ? amountInput(debt.amount_within_12_months) : '',
  };
}

export function debtOf(values: DebtFormValues): DebtLine {
  const amount = normalizeDecimal(values.amount);
  let within = normalizeDecimal(values.withinAmount);
  if (values.within === 'yes') within = amount;
  if (values.within === 'no') within = '0';
  return { category: values.category, label: values.label, amount, amount_within_12_months: within };
}
