'use client';

import { useMemo } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { StockAdjustmentPayload, StockExitPayload, StockExitReason, StockLevel } from '@/lib/hooks/useStock';
import { parseQuantity } from '../QuantityStepper';
import { QUANTITY, toDecimal } from '../stockSchema';

/** Motif d'une sortie ; « correction » remplace le stock par la quantité comptée. */
export type StockExitMotive = StockExitReason | 'adjustment';
export const EXIT_MOTIVES: StockExitMotive[] = ['loss', 'breakage', 'internal_use', 'adjustment'];

type TranslateCommon = (key: 'quantity_invalid' | 'lines_empty') => string;
type TranslateExit = {
  (key: 'count_invalid' | 'reason_required'): string;
  (key: 'insufficient', values: { available: number }): string;
};

function exitSchema(t: TranslateExit, tc: TranslateCommon) {
  const line = z.object({
    variant: z.string(),
    name: z.string(),
    packaging: z.string(),
    stock: z.string(),
    /** Quantité sortie, ou quantité comptée en correction. */
    quantity: z.string().trim(),
  });
  return z.object({
    reason: z.union([z.enum(EXIT_MOTIVES), z.literal('')]).refine((v) => v !== '', t('reason_required')),
    lines: z.array(line).min(1, tc('lines_empty')),
    note: z.string().trim().max(500),
  }).superRefine(({ reason, lines }, ctx) => {
    lines.forEach((l, index) => {
      const n = QUANTITY.test(l.quantity) ? Number(toDecimal(l.quantity)) : NaN;
      const path = ['lines', index, 'quantity'];
      if (reason === 'adjustment') {
        if (!(n >= 0)) ctx.addIssue({ code: 'custom', path, message: t('count_invalid') });
      } else if (!(n > 0)) {
        ctx.addIssue({ code: 'custom', path, message: tc('quantity_invalid') });
      } else if (n > Number(l.stock)) {
        // Une sortie manuelle reste limitée au stock disponible (seule une vente peut le rendre négatif).
        ctx.addIssue({ code: 'custom', path, message: t('insufficient', { available: Math.max(0, Number(l.stock)) }) });
      }
    });
  });
}

/** Valeurs saisies (motif encore vide possible) et valeurs validées (motif choisi). */
export type StockExitValues = z.input<ReturnType<typeof exitSchema>>;
export type StockExitOutput = z.output<ReturnType<typeof exitSchema>>;
export type StockExitForm = UseFormReturn<StockExitValues, unknown, StockExitOutput>;

/** Écart d'une ligne en correction (compté − stock), `NaN` si la quantité est illisible. */
export const lineGap = (stock: string, counted: string): number => parseQuantity(counted) - Number(stock);

/** Pied : lignes et unités sorties, ou formats dont le stock change en correction. */
function exitTotals(lines: StockExitValues['lines']) {
  let units = 0;
  for (const line of lines) {
    const q = parseQuantity(line.quantity);
    if (Number.isFinite(q)) units += q;
  }
  const changed = lines.filter((l) => { const gap = lineGap(l.stock, l.quantity); return Number.isFinite(gap) && gap !== 0; }).length;
  return { count: lines.length, units, changed };
}

export function exitPayload(values: StockExitOutput, reason: StockExitReason): StockExitPayload {
  return {
    lines: values.lines.map((l) => ({ variant: l.variant, quantity: toDecimal(l.quantity) })),
    reason,
    note: values.note.trim(),
  };
}

export function adjustmentPayload(values: StockExitOutput): StockAdjustmentPayload {
  return { lines: values.lines.map((l) => ({ variant: l.variant, counted_quantity: toDecimal(l.quantity) })), note: values.note.trim() };
}

/** Formulaire de sortie : un format ajouté deux fois voit sa quantité augmenter (scans successifs, comptage). */
export function useStockExitForm(reason: StockExitMotive | '', initial: StockLevel | null) {
  const tc = useTranslations('stock.common');
  const t = useTranslations('stock.exit');
  const schema = useMemo(() => exitSchema(t, tc), [t, tc]);
  const form = useForm<StockExitValues, unknown, StockExitOutput>({
    resolver: zodResolver(schema),
    defaultValues: { reason, lines: initial ? [lineFromLevel(initial, reason)] : [], note: '' },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const totals = exitTotals(useWatch({ control: form.control, name: 'lines' }));
  const current = useWatch({ control: form.control, name: 'reason' });

  /** Vers ou depuis la correction, chaque quantité change de sens : comptée = stock actuel, sortie = 1. */
  function switchReason(next: StockExitMotive) {
    if ((next === 'adjustment') === (current === 'adjustment')) return;
    form.getValues('lines').forEach((l, index) => {
      form.setValue(`lines.${index}.quantity`, startQuantity(l.stock, next), { shouldDirty: true });
    });
    if (form.formState.isSubmitted) void form.trigger('lines');
  }

  function addLevel(level: StockLevel) {
    const index = form.getValues('lines').findIndex((l) => l.variant === level.id);
    if (index < 0) {
      lines.append(lineFromLevel(level, form.getValues('reason')), { shouldFocus: false });
      return;
    }
    const quantity = parseQuantity(form.getValues(`lines.${index}.quantity`));
    form.setValue(`lines.${index}.quantity`, String((Number.isFinite(quantity) ? quantity : 0) + 1), { shouldDirty: true });
  }

  return { form, lines, totals, addLevel, switchReason };
}

/** Sortie : une unité. Correction : la quantité comptée part du stock actuel (écart nul). */
const startQuantity = (stock: string, reason: StockExitMotive | ''): string =>
  (reason === 'adjustment' ? String(Math.max(0, Number(stock))) : '1');

function lineFromLevel(level: StockLevel, reason: StockExitMotive | ''): StockExitValues['lines'][number] {
  return {
    variant: level.id, name: level.product_name, packaging: level.packaging_name, stock: level.stock_quantity,
    quantity: startQuantity(level.stock_quantity, reason),
  };
}
