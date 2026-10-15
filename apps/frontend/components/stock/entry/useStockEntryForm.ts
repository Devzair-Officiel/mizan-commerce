'use client';

import { useMemo } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { StockEntryPayload, StockLevel } from '@/lib/hooks/useStock';
import { parseQuantity } from '../QuantityStepper';
import { amountField, quantityField, toDecimal } from '../stockSchema';

type Translate = (key: 'quantity_invalid' | 'amount_invalid' | 'lines_empty' | 'line_unassociated') => string;

function entrySchema(t: Translate) {
  const line = z.object({
    /** Format associé ; vide pour une ligne de facture « à associer » ou ignorée. */
    variant: z.string(),
    name: z.string(),
    packaging: z.string(),
    /** Stock actuel ; `null` pour une ligne de facture (pas de colonne Stock). */
    stock: z.string().nullable(),
    quantity: quantityField(t),
    price: amountField(t),
    invoiceIndex: z.number().nullable(),
    /** Texte lu sur la facture. */
    readLabel: z.string(),
    /** Ligne de facture ignorée (frais de port, remise…) : hors de l'entrée. */
    ignored: z.boolean(),
  }).refine((l) => l.ignored || l.variant !== '', { path: ['variant'], message: t('line_unassociated') });
  return z.object({
    lines: z.array(line).min(1, t('lines_empty')),
    supplier_name: z.string().trim().max(255),
    invoice_number: z.string().trim().max(100),
    invoice_date: z.string(),
  });
}

export type StockEntryValues = z.infer<ReturnType<typeof entrySchema>>;
export type StockEntryLineValues = StockEntryValues['lines'][number];
export type StockEntryForm = UseFormReturn<StockEntryValues>;

export const EMPTY_ENTRY: StockEntryValues = { lines: [], supplier_name: '', invoice_number: '', invoice_date: '' };

/** Ligne saisie à la main : une unité, au dernier prix d'achat. */
export const lineFromLevel = (level: StockLevel): StockEntryLineValues => ({
  variant: level.id, name: level.product_name, packaging: level.packaging_name, stock: level.stock_quantity,
  quantity: '1', price: level.purchase_price ?? '', invoiceIndex: null, readLabel: '', ignored: false,
});

/** Total d'une ligne en centimes arrondis (affichage), `null` sans prix ou quantité lisible. */
export function lineTotal(quantity: string, price: string): number | null {
  const q = parseQuantity(quantity);
  const p = parseQuantity(price);
  return Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) / 100 : null;
}

/** Pied du tableau : lignes entrées, unités reçues, total d'achat et lignes à associer (hors lignes ignorées). */
function entryTotals(all: StockEntryLineValues[]) {
  const lines = all.filter((l) => !l.ignored);
  let units = 0;
  let amount = 0;
  for (const line of lines) {
    const q = parseQuantity(line.quantity);
    if (Number.isFinite(q)) units += q;
    amount += lineTotal(line.quantity, line.price) ?? 0;
  }
  return { count: lines.length, units, amount: Math.round(amount * 100) / 100, unassociated: lines.filter((l) => l.variant === '').length };
}
export type StockEntryTotals = ReturnType<typeof entryTotals>;

/** Valeurs du formulaire au format de `POST /stock/entries/`. */
export function entryPayload(values: StockEntryValues, ocrDocument: string | null): StockEntryPayload {
  const ignored = values.lines.filter((l) => l.ignored).flatMap((l) => (l.invoiceIndex === null ? [] : [l.invoiceIndex]));
  return {
    lines: values.lines.filter((l) => !l.ignored).map((l) => ({
      variant: l.variant,
      quantity: toDecimal(l.quantity),
      unit_purchase_price: l.price.trim() ? toDecimal(l.price) : null,
      invoice_line_index: l.invoiceIndex,
    })),
    supplier_name: values.supplier_name,
    invoice_number: values.invoice_number,
    invoice_date: values.invoice_date || null,
    ocr_document: ocrDocument,
    ...(ignored.length > 0 ? { ignored_line_indices: ignored } : {}),
  };
}

/** Formulaire d'entrée multi-lignes ; un format ajouté deux fois voit sa quantité augmenter (scans successifs). */
export function useStockEntryForm(defaultValues: StockEntryValues) {
  const tc = useTranslations('stock.common');
  const schema = useMemo(() => entrySchema(tc), [tc]);
  const form = useForm<StockEntryValues>({ resolver: zodResolver(schema), defaultValues });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const totals = entryTotals(useWatch({ control: form.control, name: 'lines' }));

  function addLevel(level: StockLevel) {
    const index = form.getValues('lines').findIndex((l) => l.variant === level.id);
    if (index < 0) {
      lines.append(lineFromLevel(level), { shouldFocus: false });
      return;
    }
    const quantity = parseQuantity(form.getValues(`lines.${index}.quantity`));
    form.setValue(`lines.${index}.quantity`, String((Number.isFinite(quantity) ? quantity : 0) + 1), { shouldDirty: true });
  }

  return { form, lines, totals, addLevel };
}
