'use client';

import { useTranslations } from 'next-intl';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import type { ZakatFormat } from '../useZakatFormat';
import { useAsideNote } from './useAsideNote';

type RowKey = 'cash' | 'stock' | 'receivables' | 'other' | 'debts';

/** Ligne du récapitulatif → étape de l'assistant où elle se saisit. */
const ROWS: readonly { key: RowKey; step: number; source: 'entered' | 'mizan' }[] = [
  { key: 'cash', step: 1, source: 'entered' },
  { key: 'stock', step: 2, source: 'mizan' },
  { key: 'receivables', step: 3, source: 'mizan' },
  { key: 'other', step: 4, source: 'entered' },
  { key: 'debts', step: 5, source: 'entered' },
];

function rowValue(calc: ZakatCalculation, key: RowKey): string | null {
  const { totals } = calc;
  switch (key) {
    case 'cash': return totals.cash;
    case 'stock': return totals.stock;
    case 'receivables': return totals.receivables_sure;
    case 'other': return totals.other_assets;
    case 'debts': return totals.debts_deducted;
  }
}

interface CalculationAsideProps {
  calc: ZakatCalculation;
  /** Étape affichée : sa ligne est mise en avant. */
  step: number;
  format: ZakatFormat;
  /** Dans la fenêtre du bas (mobile) : sans cadre ni bandeau, la fenêtre a déjà son titre. */
  bare?: boolean;
}

function AsideRow({ label, value, pill, current, waiting }: {
  label: string; value: string; pill: string; current: boolean; waiting: boolean;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm', current && 'bg-primary/7 font-semibold', waiting && 'text-muted-foreground')}>
      <span className="flex items-center gap-2">
        {label}
        <span className="rounded-md border border-border px-1.25 text-[0.6875rem] font-semibold text-muted-foreground">{pill}</span>
      </span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
}

/**
 * « Votre calcul » : chaque montant du serveur, ligne par ligne, jusqu'à la zakat estimée. Une étape
 * pas encore validée garde son montant (déjà repris par Mizan), atténué, avec « Étape N ».
 */
export function CalculationAside({ calc, step, format, bare }: CalculationAsideProps) {
  const t = useTranslations('zakat.aside');
  const tc = useTranslations('zakat.common');
  const { totals } = calc;
  const provisional = calc.current_step < 6;
  const note = useAsideNote(calc, step, format);
  const dash = (value: string | null) => (value === null ? '—' : format.money(value));

  return (
    <section aria-label={t('title')} className={cn(!bare && 'overflow-hidden rounded-2xl border border-border bg-card')}>
      {!bare && (
        <div className="header-band border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-0.5 text-[0.78125rem] text-muted-foreground">{t('hint')}</p>
        </div>
      )}
      <div className="py-2">
        {ROWS.map((row) => {
          const waiting = row.step >= calc.current_step && row.step !== step;
          const value = rowValue(calc, row.key);
          return (
            <AsideRow key={row.key} label={t(`row.${row.key}`)} current={row.step === step} waiting={waiting}
              pill={waiting ? t('pending', { n: row.step + 1 }) : tc(row.source === 'mizan' ? 'source_mizan' : 'source_entered')}
              value={row.key === 'debts' && value !== null ? format.minus(value) : dash(value)} />
          );
        })}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border px-5 pt-3.5 pb-2.5 text-sm font-semibold">
          <span>{t(provisional ? 'base_provisional' : 'base')}</span>
          <span className="whitespace-nowrap tabular-nums">{dash(totals.nisab_compared_amount)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[0.8125rem] text-muted-foreground">
          <span>{t('threshold', { nisab: calc.choices.nisab_method ? tc('nisab_name', { method: calc.choices.nisab_method }) : '—' })}</span>
          <span className="whitespace-nowrap tabular-nums">{dash(totals.nisab_threshold)}</span>
        </div>
      </div>
      <div className="m-3 mt-2 rounded-xl bg-secondary p-4 text-secondary-foreground">
        <p className="text-[0.8125rem] font-medium">{t(provisional ? 'zakat_provisional' : 'zakat')}</p>
        <p className="mt-1 text-[1.875rem] font-bold tracking-tight tabular-nums">{dash(totals.zakat_total)}</p>
        {note.map((line) => <p key={line} className="mt-1 text-xs opacity-85">{line}</p>)}
      </div>
    </section>
  );
}
