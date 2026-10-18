'use client';

import { useTranslations } from 'next-intl';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import type { DebtLine, ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';
import { AddLineButton } from '../AddLineButton';
import { DebtTable } from './DebtTable';
import { withinOf } from './debtForm';

interface DebtListCardProps {
  calc: ZakatCalculation;
  format: ZakatFormat;
  onEdit: (index: number) => void;
  onAdd: () => void;
}

/** Mobile : la ligne se touche pour modifier ; l'échéance se lit sous la description. */
function DebtRow({ debt, format, onEdit }: { debt: DebtLine; format: ZakatFormat; onEdit: () => void }) {
  const t = useTranslations('zakat');
  const category = t(`debt_category.${debt.category}`);
  const within = withinOf(debt);
  let sub = category;
  if (within === 'yes') sub = t('steps.debts.row_within_short', { category });
  if (within === 'partial') sub = t('steps.debts.row_partial_short', { category, within: format.money(debt.amount_within_12_months) });
  return (
    <li className="border-b border-border last:border-b-0">
      <button type="button" onClick={onEdit} className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary/30">
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block text-sm font-semibold text-foreground">{debt.label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
        </span>
        <span className="text-sm font-semibold whitespace-nowrap text-foreground tabular-nums">{format.money(debt.amount)}</span>
      </button>
    </li>
  );
}

/** Dettes au jour J : tableau sur desktop, lignes sur mobile, total déduit selon le choix (serveur). */
export function DebtListCard({ calc, format, onEdit, onAdd }: DebtListCardProps) {
  const t = useTranslations('zakat.steps.debts');
  const debts = calc.debt_items;
  const total = calc.totals.debts_deducted;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="header-band flex items-center justify-between gap-3 border-b border-border px-4 py-4 lg:px-5">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('list_title')}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground max-lg:hidden">{t('list_hint')}</p>
        </div>
        <button type="button" onClick={onAdd} className={`${HEADER_LINK} relative after:absolute after:-inset-1.5 lg:hidden`}>{t('add_short')}</button>
      </div>
      {debts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{t('empty')}</p>
      ) : (
        <>
          <DebtTable debts={debts} mode={calc.choices.debts_mode} total={total} format={format} onEdit={onEdit} />
          <ul className="lg:hidden">
            {debts.map((debt, index) => (
              <DebtRow key={`${debt.category}-${index}`} debt={debt} format={format} onEdit={() => onEdit(index)} />
            ))}
          </ul>
          <p className="flex justify-between gap-3 border-t border-border bg-muted/50 px-4 py-2.5 text-[0.84375rem] lg:hidden">
            <span>{t('total')}</span>
            <span className="font-semibold whitespace-nowrap tabular-nums">{total === null ? '—' : format.money(total)}</span>
          </p>
        </>
      )}
      <div className="px-5 pt-4 pb-5 max-lg:hidden">
        <AddLineButton label={t('add')} onClick={onAdd} />
      </div>
    </section>
  );
}
