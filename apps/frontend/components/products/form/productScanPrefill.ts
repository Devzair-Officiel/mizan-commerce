import type { ProductScan } from '@/lib/hooks/useProductScan';
import { UNITS, type ProductFormValues } from './productFormSchema';

/** Champs du formulaire qu'un scan peut pré-remplir. Jamais le prix. */
export interface ScanProposals {
  name?: string;
  description?: string;
  unit?: ProductFormValues['unit'];
  'formats.0.barcode'?: string;
}
export type ScanTarget = keyof ScanProposals;

const NAME_MAX = 200;

const isUnit = (value: string): value is ProductFormValues['unit'] => UNITS.some((u) => u === value);

/** Valeur de chaque champ proposée par le scan ; une unité hors de `UNITS` n'est pas proposée. */
export function scanProposals(scan: ProductScan): ScanProposals {
  const { fields } = scan;
  const proposals: ScanProposals = {};
  // Nom composé par le serveur ([marque] désignation [variante] [contenance]) : une marque seule
  // ne nomme pas un article, le serveur ne propose alors rien.
  const name = fields.name?.value.slice(0, NAME_MAX).trim();
  if (name) proposals.name = name;
  if (fields.description) proposals.description = fields.description.value;
  if (fields.unit_suggestion && isUnit(fields.unit_suggestion.value)) proposals.unit = fields.unit_suggestion.value;
  if (fields.barcode) proposals['formats.0.barcode'] = fields.barcode.value;
  return proposals;
}
