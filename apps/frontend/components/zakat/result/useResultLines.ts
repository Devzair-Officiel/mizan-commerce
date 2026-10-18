'use client';

import { useTranslations } from 'next-intl';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';

export interface ResultLine {
  key: string;
  /** Opération affichée en tête de ligne ; le signe des dettes est porté par « − », pas par le montant. */
  op: '+' | '−' | '=' | '×' | '<';
  label: string;
  /** Libellé mobile, plus court. */
  shortLabel?: string;
  /** « Saisi » ou « Mizan » : pastille sur desktop, petite ligne sous le libellé sur mobile. */
  source?: string;
  /** Petite ligne mobile à la place de la source (« Aucun ajouté »). */
  note?: string;
  value: string;
  /** Étape où la ligne se modifie. */
  step?: number;
  tone?: 'sum' | 'total';
}

/** « Le calcul » : chaque montant vient du serveur, l'écran ne fait que les aligner. */
export function useResultLines(calc: ZakatCalculation, format: ZakatFormat): ResultLine[] {
  const t = useTranslations('zakat');
  const { totals, choices } = calc;
  const amount = (value: string | null) => (value === null ? '—' : format.money(value));
  const entered = t('common.source_entered');
  const mizan = t('common.source_mizan');
  const sure = calc.receivable_items.filter((item) => !item.doubtful);
  const counted = calc.other_assets.filter((asset) => asset.counted).length;
  const calendar = choices.calendar ?? calc.hawl_calendar;
  const zakat: ResultLine = { key: 'zakat', op: '=', label: t('result.line.zakat'), value: amount(totals.zakat_total), tone: 'total' };

  const lines: ResultLine[] = [
    { key: 'cash', op: '+', label: t('result.line.cash'), shortLabel: t('result.line.cash_short'), source: entered, value: amount(totals.cash), step: 1 },
    {
      key: 'stock', op: '+', source: mizan, value: amount(totals.stock), step: 2,
      label: choices.stock_valuation ? t('result.line.stock', { valuation: choices.stock_valuation }) : t('result.line.stock_missing'),
    },
  ];
  if (sure.length > 0) {
    lines.push({
      key: 'receivables', op: '+', label: t('result.line.receivables', { count: sure.length }), value: amount(totals.receivables_sure), step: 3,
      source: sure.some((item) => item.order_id !== null) ? mizan : entered,
    });
  }
  lines.push(
    {
      key: 'other', op: '+', label: t('result.line.other', { count: counted }), source: entered, value: amount(totals.other_assets), step: 4,
      note: counted === 0 ? t('result.line.other_none') : undefined,
    },
    {
      key: 'debts', op: '−', source: entered, value: amount(totals.debts_deducted), step: 5,
      label: choices.debts_mode ? t('result.line.debts', { mode: choices.debts_mode }) : t('result.line.debts_missing'),
    },
    { key: 'base', op: '=', label: t('result.line.base'), value: amount(totals.nisab_compared_amount), tone: 'sum' },
  );
  if (totals.status === 'above_nisab') {
    lines.push({ key: 'rate', op: '×', label: t('result.line.rate', { calendar }), value: t('result.line.rate_value', { calendar }) });
  } else if (totals.status === 'below_nisab' && choices.nisab_method) {
    const nisab = t('common.nisab_name', { method: choices.nisab_method });
    lines.push({ key: 'threshold', op: '<', label: t('result.line.threshold', { nisab }), value: amount(totals.nisab_threshold) });
  }
  lines.push(zakat);
  return lines;
}
