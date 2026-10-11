import type { StockExitForm } from './useStockExitForm';

export interface StockExitLineProps {
  form: StockExitForm;
  index: number;
  onRemove: () => void;
}
