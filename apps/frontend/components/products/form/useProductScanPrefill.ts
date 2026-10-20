'use client';

import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ProductScan, ScanOutcome } from '@/lib/hooks/useProductScan';
import type { ProductFormValues } from './productFormSchema';
import { scanProposals, type ScanProposals } from './productScanPrefill';

type TextTarget = 'name' | 'description' | 'formats.0.barcode';
const TEXT_TARGETS: readonly TextTarget[] = ['name', 'description', 'formats.0.barcode'];

/**
 * Pré-remplissage du formulaire par un scan d'emballage (URS-109) : seuls les champs encore vides
 * sont remplis — jamais une saisie écrasée, jamais le prix — et l'unité seulement si elle n'a pas
 * été choisie. `detected` garde la valeur posée par champ : le badge « Détecté, à vérifier »
 * s'affiche tant que le champ la contient. Un code-barres rempli ouvre la carte Référence.
 */
export function useProductScanPrefill(form: UseFormReturn<ProductFormValues>, openReference: () => void) {
  const [detected, setDetected] = useState<ScanProposals>({});

  const apply = (scan: ProductScan): ScanOutcome => {
    const proposals = scanProposals(scan);
    const filled: ScanProposals = {};
    for (const target of TEXT_TARGETS) {
      const value = proposals[target];
      if (value === undefined || form.getValues(target).trim() !== '') continue;
      form.setValue(target, value, { shouldDirty: true });
      filled[target] = value;
    }
    // Une unité déjà en place (« pièce » par défaut) n'est ni remplie ni signalée.
    if (proposals.unit && proposals.unit !== form.getValues('unit') && !form.getFieldState('unit').isDirty) {
      form.setValue('unit', proposals.unit, { shouldDirty: true });
      filled.unit = proposals.unit;
    }
    setDetected((prev) => ({ ...prev, ...filled }));
    if (filled['formats.0.barcode']) openReference();
    return { found: Object.keys(proposals).length, filled: Object.keys(filled).length };
  };

  return { detected, apply };
}
