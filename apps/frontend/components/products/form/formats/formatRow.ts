import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { ProductVariant } from '@/lib/hooks/useProducts';
import type { FormatRow, ProductFormValues } from '../productFormSchema';
import type { ProductFormats } from '../useProductFormats';

/** Ce qu'il faut à une ligne du tableau (desktop) ou à sa carte (mobile). */
export interface FormatRowProps {
  index: number;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<FormatRow> | undefined;
  formats: ProductFormats;
  /** Format enregistré de la ligne (modification) : stock actuel, entrée rapide, suppression possible. */
  variant: ProductVariant | undefined;
  /** Symbole de la devise (« € »). */
  currency: string;
  /** Nom affiché de la ligne : son nom saisi, sinon « Format N ». */
  label: string;
  onEntry: (variant: ProductVariant) => void;
}
