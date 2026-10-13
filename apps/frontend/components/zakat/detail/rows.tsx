import type { useTranslations } from 'next-intl';
import { Package, Receipt, Users, Wallet } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

type ZakatT = ReturnType<typeof useTranslations<'zakat'>>;

type Row = {
  label: string;
  amount: string;
  hint?: string;
  tone?: 'add' | 'sub';
  icon: React.ReactNode;
};

export function buildPatrimoineRows(calc: ZakatCalculation, t: ZakatT): Row[] {
  const receivablesVentilated = calc.receivables_breakdown && calc.receivables_breakdown.length > 0;
  const stockVentilated = calc.stock_breakdown && calc.stock_breakdown.length > 0;
  const stockAdjusted =
    !stockVentilated && calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '';

  const receivablesRows: Row[] = receivablesVentilated
    ? calc.receivables_breakdown.map((r) => ({
        label: t(`receivable_category.${r.category}`),
        amount: r.amount,
        hint: r.category === 'doubtful' ? t('rows.doubtful_hint') : undefined,
        tone: r.category === 'doubtful' ? undefined : ('add' as const),
        icon: <Users size={14} />,
      }))
    : [
        {
          label: t('common.receivables'),
          amount: calc.receivables_amount,
          hint:
            calc.has_receivables && parseFloat(calc.receivables_nominal || '0') > 0
              ? t('rows.nominal_hint', { amount: formatMoney(calc.receivables_nominal, calc.currency) })
              : undefined,
          tone: 'add' as const,
          icon: <Users size={14} />,
        },
      ];

  const stockRows: Row[] = stockVentilated
    ? calc.stock_breakdown.map((s) => ({
        label: t(`stock_category.${s.category}`),
        amount: s.amount,
        tone: 'add' as const,
        icon: <Package size={14} />,
      }))
    : [
        {
          label: stockAdjusted ? t('rows.stock_adjusted') : t('rows.stock_estimated'),
          amount: calc.stock_value_for_base,
          hint: stockAdjusted
            ? t('rows.stock_initial', { amount: formatMoney(calc.stock_value_estimated, calc.currency) })
            : undefined,
          tone: 'add' as const,
          icon: <Package size={14} />,
        },
      ];

  return [
    {
      label: t('common.cash'),
      amount: calc.cash_amount,
      tone: 'add' as const,
      icon: <Wallet size={14} />,
    },
    ...receivablesRows,
    ...stockRows,
  ];
}

export function buildDebtsRows(calc: ZakatCalculation, t: ZakatT): Row[] {
  return calc.debts_breakdown.map((d) => {
    const category = t(`debt_category.${d.category}`);
    return {
      label: d.label || category,
      amount: d.amount,
      hint: t(d.is_immediately_due ? 'rows.debt_due' : 'rows.debt_not_due', { category }),
      tone: d.is_immediately_due ? ('sub' as const) : undefined,
      icon: <Receipt size={14} />,
    };
  });
}

export function computePatrimoineTotal(calc: ZakatCalculation): number {
  return (
    parseFloat(calc.cash_amount || '0') +
    parseFloat(calc.receivables_amount || '0') +
    parseFloat(calc.stock_value_for_base || '0')
  );
}
