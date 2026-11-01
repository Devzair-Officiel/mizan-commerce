'use client';

import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { parseQuantity } from '@/components/stock/QuantityStepper';
import type { CreditNoteInput } from '@/lib/hooks/useCreditNotes';
import type { Invoice } from '@/lib/hooks/useInvoices';

/** Longueur maximale du motif, revérifiée par le serveur. */
export const REASON_MAX = 500;

/** Reste à créditer d'une ligne (quantité facturée moins déjà créditée), au millième. */
export function lineLeft(line: Invoice['lines'][number]): number {
  return Math.max(Math.round((Number(line.quantity) - Number(line.credited_quantity ?? 0)) * 1000) / 1000, 0);
}

/** Quantité saisie valide (0 à `left`, trois décimales au plus), sinon `null`. */
export function quantityOf(raw: string, left: number): number | null {
  const n = parseQuantity(raw);
  return Number.isFinite(n) && n >= 0 && n <= left && Math.round(n * 1000) === n * 1000 ? n : null;
}

/** Les quantités ne passent pas par le schéma : leur erreur se dérive de la saisie, ligne par ligne. */
function creditSchema(t: ReturnType<typeof useTranslations<'invoices.credit'>>) {
  return z.object({
    mode: z.enum(['total', 'partial']),
    lines: z.array(z.object({ line: z.string(), quantity: z.string() })),
    include_shipping: z.boolean(),
    reason: z.string().trim().min(1, t('reason_required')).max(REASON_MAX, t('reason_too_long', { max: REASON_MAX })),
    accepted: z.boolean(),
  });
}
export type CreditNoteValues = z.infer<ReturnType<typeof creditSchema>>;

/** Entrée de l'aperçu et de la création ; `null` si une quantité est invalide (rien à prévoir). */
function inputOf(invoice: Invoice, values: Pick<CreditNoteValues, 'mode' | 'lines' | 'include_shipping'>): CreditNoteInput | null {
  if (values.mode === 'total') return { mode: 'total', lines: [], include_shipping: false };
  const rows = invoice.lines.map((line, i) => ({ line: line.id, quantity: quantityOf(values.lines[i]?.quantity ?? '0', lineLeft(line)) }));
  if (rows.some((row) => row.quantity === null)) return null;
  return {
    mode: 'partial',
    lines: rows.flatMap((row) => row.quantity ? [{ line: row.line, quantity: String(row.quantity) }] : []),
    include_shipping: values.include_shipping,
  };
}

/** Saisie de l'avoir (mode, quantités, livraison, motif, acceptation des recommandations). */
export function useCreditNoteForm(invoice: Invoice) {
  const t = useTranslations('invoices.credit');
  const schema = useMemo(() => creditSchema(t), [t]);
  const form = useForm<CreditNoteValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      mode: 'total', include_shipping: false, reason: '', accepted: false,
      lines: invoice.lines.map((line) => ({ line: line.id, quantity: '0' })),
    },
  });
  const [mode, lines, includeShipping] = useWatch({ control: form.control, name: ['mode', 'lines', 'include_shipping'] });
  const input = inputOf(invoice, { mode, lines, include_shipping: includeShipping });
  return { form, input, partial: mode === 'partial', inputOf: (values: CreditNoteValues) => inputOf(invoice, values) };
}
export type CreditNoteForm = ReturnType<typeof useCreditNoteForm>;
