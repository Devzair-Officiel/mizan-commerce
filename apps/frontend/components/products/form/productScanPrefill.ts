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

const contains = (text: string, part: string) => text.toLocaleLowerCase().includes(part.toLocaleLowerCase());

/**
 * Nom proposé : le nom lu, complété de la marque et de la contenance s'il ne les cite pas déjà
 * (« Lait demi-écrémé Lactel 1 L »). Le formulaire n'a pas de champ marque ni contenance ; sans
 * nom lu, rien n'est proposé (une marque seule ne nomme pas un article).
 */
export function proposedName({ name, brand, net_quantity }: ProductScan['fields']): string | null {
  if (!name) return null;
  const parts = [name.value];
  if (brand && !contains(name.value, brand.value)) parts.push(brand.value);
  if (net_quantity && !contains(name.value, net_quantity.value)) parts.push(net_quantity.value);
  return parts.join(' ').slice(0, NAME_MAX).trim() || null;
}

const isUnit = (value: string): value is ProductFormValues['unit'] => UNITS.some((u) => u === value);

/** Valeur de chaque champ proposée par le scan ; une unité hors de `UNITS` n'est pas proposée. */
export function scanProposals(scan: ProductScan): ScanProposals {
  const { fields } = scan;
  const proposals: ScanProposals = {};
  const name = proposedName(fields);
  if (name) proposals.name = name;
  if (fields.description) proposals.description = fields.description.value;
  if (fields.unit_suggestion && isUnit(fields.unit_suggestion.value)) proposals.unit = fields.unit_suggestion.value;
  if (fields.barcode) proposals['formats.0.barcode'] = fields.barcode.value;
  return proposals;
}
