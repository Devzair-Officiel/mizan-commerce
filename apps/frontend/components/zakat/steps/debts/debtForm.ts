import { z } from 'zod';
import { AMOUNT_PATTERN, compareDecimal, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import type { DebtCategory, DebtLine } from '@/lib/hooks/useZakat';

export const DEBT_CATEGORIES = ['supplier', 'tax_vat', 'salary', 'loan', 'rent', 'other'] as const satisfies readonly DebtCategory[];
export const WITHIN = ['yes', 'partial', 'no'] as const;
export type Within = (typeof WITHIN)[number];

/** Dû dans les 12 mois : en entier, en partie ou pas du tout (comparaison des montants saisis, aucun calcul). */
export function withinOf(debt: DebtLine): Within {
  if (isZeroDecimal(debt.amount_within_12_months)) return 'no';
  return compareDecimal(debt.amount_within_12_months, debt.amount) >= 0 ? 'yes' : 'partial';
}

interface DebtMessages {
  label: string;
  amount: string;
  tooHigh: string;
  scope: string;
}

const isAmount = (v: string) => AMOUNT_PATTERN.test(v) && !isZeroDecimal(normalizeDecimal(v));

/** `askScope` : part inférieure à 100 %, la ligne est à classer (boutique ou personnelle), sans valeur par défaut. */
export function debtSchema(messages: DebtMessages, askScope: boolean) {
  return z.object({
    category: z.enum(DEBT_CATEGORIES),
    label: z.string().trim().min(1, messages.label).max(200),
    amount: z.string().trim().refine(isAmount, messages.amount),
    within: z.enum(WITHIN),
    withinAmount: z.string().trim(),
    scope: z.enum(['shop', 'personal']).nullable().refine((v) => !askScope || v !== null, messages.scope),
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
  if (!debt) return { category: 'supplier', label: '', amount: '', within: 'yes', withinAmount: '', scope: null };
  const within = withinOf(debt);
  return {
    category: debt.category,
    label: debt.label,
    amount: amountInput(debt.amount),
    within,
    withinAmount: within === 'partial' ? amountInput(debt.amount_within_12_months) : '',
    scope: debt.scope,
  };
}

/** `id` : celui de la ligne modifiée ; une nouvelle ligne en reçoit un. Portée `null` tant qu'elle n'est pas choisie (choix masqué à 100 %). */
export function debtOf(values: DebtFormValues, id?: string): DebtLine {
  const amount = normalizeDecimal(values.amount);
  let within = normalizeDecimal(values.withinAmount);
  if (values.within === 'yes') within = amount;
  if (values.within === 'no') within = '0';
  return {
    id: id ?? crypto.randomUUID(), scope: values.scope,
    category: values.category, label: values.label, amount, amount_within_12_months: within,
  };
}
