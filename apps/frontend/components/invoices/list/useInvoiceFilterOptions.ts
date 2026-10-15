'use client';

import { useTranslations } from 'next-intl';
import type { InvoicesFacets } from '@/lib/hooks/useInvoices';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import { STATUS_DOT, PAYMENT_BADGE } from '../shared/status';
import type { InvoiceSelection } from './useInvoicesPageState';

export const SORT_FIELDS = ['number', 'buyer_name', 'issued_at', 'due_date', 'total_ttc', 'status'] as const;

export function useInvoiceFilterOptions(facets?: InvoicesFacets) {
  const t = useTranslations('invoices.list');
  const statusOptions: FilterOption<InvoiceSelection['status']>[] = (['', 'issued', 'paid', 'cancelled'] as const).map(value => ({
    value, label: t('filter', { value: value || 'all' }), dotClassName: value ? STATUS_DOT[value] : undefined,
    count: facets?.status[value || 'all'],
  }));
  const paymentOptions: FilterOption<InvoiceSelection['payment']>[] = (['all', 'due', 'unpaid', 'partial', 'paid'] as const).map(value => ({
    value, label: t('payment_filter', { value }), badgeClassName: value === 'all' ? undefined : PAYMENT_BADGE[value],
    count: facets?.payment[value],
  }));
  const periodOptions: FilterOption<InvoiceSelection['period']>[] = (['', 'issued_month', 'paid_month'] as const).map(value => ({
    value, label: value ? t(`stats.${value}`) : t('all_periods'),
  }));
  const sortOptions = SORT_FIELDS.flatMap(field => (['desc', 'asc'] as const).map(dir => ({
    value: dir === 'desc' ? `-${field}` : field, label: t('sort_label', { field: t(`columns.${field}`), dir }),
  })));
  const sortLabel = (ordering: string) => {
    const { field, direction } = parseOrdering(ordering);
    const key = SORT_FIELDS.find(f => f === field) ?? 'issued_at';
    return t('sort_label', { field: t(`columns.${key}`), dir: direction });
  };
  return { statusOptions, paymentOptions, periodOptions, sortOptions, sortLabel };
}
