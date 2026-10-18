'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DebtLine, DebtsMode } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';
import { NUM, TD, TFOOT, TH } from '../tableStyles';
import { deductedOf, withinOf } from './debtForm';

interface DebtTableProps {
  debts: DebtLine[];
  mode: DebtsMode | null;
  /** Total déduit selon le choix, calculé par le serveur ; nul tant que le choix n'est pas fait. */
  total: string | null;
  format: ZakatFormat;
  onEdit: (index: number) => void;
}

/** Desktop : dette, catégorie, reste dû, échéance et montant déduit selon le choix. */
export function DebtTable({ debts, mode, total, format, onEdit }: DebtTableProps) {
  const t = useTranslations('zakat');
  const money = (value: string | null) => (value === null ? '—' : format.money(value));
  return (
    <table className="w-full border-collapse max-lg:hidden">
      <thead className="header-band">
        <tr>
          <th className={TH}>{t('steps.debts.col_debt')}</th>
          <th className={TH}>{t('steps.debts.col_category')}</th>
          <th className={`${TH} text-end`}>{t('steps.debts.col_amount')}</th>
          <th className={TH}>{t('steps.debts.col_within')}</th>
          <th className={`${TH} text-end`}>{t('steps.debts.col_deducted')}</th>
          <th className={TH} />
        </tr>
      </thead>
      <tbody>
        {debts.map((debt, index) => {
          const within = withinOf(debt);
          return (
            // Lignes sans identifiant : l'ordre de la fiche sert de clé.
            <tr key={`${debt.category}-${index}`} className="group">
              <td className={TD}>
                <div dir="auto" className="font-semibold text-foreground">{debt.label}</div>
                {within === 'partial' && (
                  <div className="text-[0.78125rem] text-muted-foreground">
                    {t('steps.debts.row_partial', { amount: format.money(debt.amount), within: format.money(debt.amount_within_12_months) })}
                  </div>
                )}
              </td>
              <td className={TD}>{t(`debt_category.${debt.category}`)}</td>
              <td className={`${TD} ${NUM}`}>{format.money(debt.amount)}</td>
              <td className={TD}>{t(`steps.debts.within.${within}`)}</td>
              <td className={`${TD} ${NUM} font-semibold text-foreground`}>{money(deductedOf(debt, mode))}</td>
              <td className={`${TD} w-14 py-0 text-end`}>
                <button type="button" onClick={() => onEdit(index)} aria-label={t('steps.debts.edit_line', { label: debt.label })}
                  className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30">
                  <Pencil className="size-4" aria-hidden />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className={TFOOT} colSpan={4}>{t('steps.debts.total')}</td>
          <td className={`${TFOOT} ${NUM}`}>{money(total)}</td>
          <td className={TFOOT} />
        </tr>
      </tfoot>
    </table>
  );
}
