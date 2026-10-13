import type {
  DebtItem,
  ExcludedItem,
  ReceivableBreakdownItem,
  StockBreakdownItem,
  ZakatCalculation,
} from '@/lib/hooks/useZakat';

export interface WizardState {
  referenceDate: string;
  cashAmount: string;
  hasReceivables: boolean;
  receivablesNominal: string;
  receivablesBreakdown: ReceivableBreakdownItem[];
  stockBreakdown: StockBreakdownItem[];
  excludedItemsAcknowledged: ExcludedItem[];
  debtsBreakdown: DebtItem[];
}

/** Étapes de l'assistant, dans l'ordre ; titres sous `zakat.wizard.steps.{clé}`. */
export const STEP_KEYS = ['cash', 'receivables', 'stock', 'excluded', 'debts', 'summary'] as const;

const today = () => new Date().toISOString().split('T')[0] ?? '';

export const INITIAL_STATE: WizardState = {
  referenceDate: today(),
  cashAmount: '',
  hasReceivables: false,
  receivablesNominal: '',
  receivablesBreakdown: [],
  stockBreakdown: [],
  excludedItemsAcknowledged: [],
  debtsBreakdown: [],
};

export function hydrateFromDraft(draft: ZakatCalculation): WizardState {
  const blank = (v: string) => (parseFloat(v || '0') === 0 ? '' : v);
  return {
    referenceDate: draft.reference_date,
    cashAmount: blank(draft.cash_amount),
    hasReceivables: draft.has_receivables,
    receivablesNominal: blank(draft.receivables_nominal),
    receivablesBreakdown: draft.receivables_breakdown ?? [],
    stockBreakdown: draft.stock_breakdown ?? [],
    excludedItemsAcknowledged: draft.excluded_items_acknowledged,
    debtsBreakdown: draft.debts_breakdown,
  };
}
