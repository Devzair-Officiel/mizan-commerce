'use client';

import { QuickEntryForm, type QuickEntryVariant } from './QuickEntryForm';

interface QuickEntrySheetProps {
  /** Format à réapprovisionner ; `null` ferme la fenêtre. */
  variant: QuickEntryVariant | null;
  currencyCode: string;
  onClose: () => void;
}

/**
 * Entrée rapide d'un seul format (Dialog sur desktop, fenêtre du bas sur
 * mobile). Remontée à chaque format : la saisie repart de zéro.
 */
export function QuickEntrySheet({ variant, currencyCode, onClose }: QuickEntrySheetProps) {
  if (!variant) return null;
  return <QuickEntryForm key={variant.id} variant={variant} currencyCode={currencyCode} onClose={onClose} />;
}
