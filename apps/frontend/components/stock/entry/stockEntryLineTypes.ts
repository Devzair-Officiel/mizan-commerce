import type { OcrMatchingCandidate } from '@/lib/hooks/useOcr';
import type { StockEntryForm } from './useStockEntryForm';

/** Props communes à la ligne du tableau (desktop) et à la carte (mobile). */
export interface StockEntryLineProps {
  form: StockEntryForm;
  index: number;
  currencyCode: string;
  /** Facture : article à associer, état et texte lu ; sinon stock avant → après. */
  invoice: { candidates: OcrMatchingCandidate[] } | null;
  onRemove: () => void;
}

export const currencySymbol = (code: string): string => (code === 'EUR' ? '€' : code);
