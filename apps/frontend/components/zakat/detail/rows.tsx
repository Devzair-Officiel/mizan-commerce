import { Package, Receipt, Users, Wallet } from 'lucide-react';
import {
  DEBT_CATEGORY_LABELS,
  RECEIVABLE_CATEGORY_LABELS,
  STOCK_CATEGORY_LABELS,
  formatMoney,
  type ZakatCalculation,
} from '@/lib/hooks/useZakat';

type Row = {
  label: string;
  amount: string;
  hint?: string;
  tone?: 'add' | 'sub';
  icon: React.ReactNode;
};

export function buildPatrimoineRows(calc: ZakatCalculation): Row[] {
  const receivablesVentilated = calc.receivables_breakdown && calc.receivables_breakdown.length > 0;
  const stockVentilated = calc.stock_breakdown && calc.stock_breakdown.length > 0;
  const stockAdjusted =
    !stockVentilated && calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '';

  const receivablesRows: Row[] = receivablesVentilated
    ? calc.receivables_breakdown.map((r) => ({
        label: RECEIVABLE_CATEGORY_LABELS[r.category],
        amount: r.amount,
        hint:
          r.category === 'doubtful'
            ? 'Archivée pour mémoire — non incluse dans la base'
            : undefined,
        tone: r.category === 'doubtful' ? undefined : ('add' as const),
        icon: <Users size={14} />,
      }))
    : [
        {
          label: 'Créances récupérables',
          amount: calc.receivables_amount,
          hint:
            calc.has_receivables && parseFloat(calc.receivables_nominal || '0') > 0
              ? `Sur un nominal de ${formatMoney(calc.receivables_nominal, calc.currency)}`
              : undefined,
          tone: 'add' as const,
          icon: <Users size={14} />,
        },
      ];

  const stockRows: Row[] = stockVentilated
    ? calc.stock_breakdown.map((s) => ({
        label: STOCK_CATEGORY_LABELS[s.category],
        amount: s.amount,
        tone: 'add' as const,
        icon: <Package size={14} />,
      }))
    : [
        {
          label: stockAdjusted ? 'Stock commercial (ajusté)' : 'Stock commercial (estimé)',
          amount: calc.stock_value_for_base,
          hint: stockAdjusted
            ? `Estimation initiale : ${formatMoney(calc.stock_value_estimated, calc.currency)}`
            : undefined,
          tone: 'add' as const,
          icon: <Package size={14} />,
        },
      ];

  return [
    {
      label: 'Argent disponible',
      amount: calc.cash_amount,
      tone: 'add' as const,
      icon: <Wallet size={14} />,
    },
    ...receivablesRows,
    ...stockRows,
  ];
}

export function buildDebtsRows(calc: ZakatCalculation): Row[] {
  return calc.debts_breakdown.map((d) => ({
    label: d.label || DEBT_CATEGORY_LABELS[d.category],
    amount: d.amount,
    hint: d.is_immediately_due
      ? `${DEBT_CATEGORY_LABELS[d.category]} · exigible immédiatement`
      : `${DEBT_CATEGORY_LABELS[d.category]} · non exigible — non déduit`,
    tone: d.is_immediately_due ? ('sub' as const) : undefined,
    icon: <Receipt size={14} />,
  }));
}

export function computePatrimoineTotal(calc: ZakatCalculation): number {
  return (
    parseFloat(calc.cash_amount || '0') +
    parseFloat(calc.receivables_amount || '0') +
    parseFloat(calc.stock_value_for_base || '0')
  );
}
