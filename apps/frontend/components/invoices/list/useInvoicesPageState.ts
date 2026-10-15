'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { InvoicesListFilters } from '@/lib/query-keys';

export const DEFAULT_ORDERING = '-issued_at';
export type InvoiceCardKey = 'due' | 'issued_month' | 'paid_month';
export interface InvoiceSelection {
  status: '' | 'issued' | 'paid' | 'cancelled';
  payment: 'all' | 'due' | 'unpaid' | 'partial' | 'paid';
  period: '' | 'issued_month' | 'paid_month';
  ordering: string;
}
export const EMPTY_FILTERS = { status: '', payment: 'all', period: '' } as const;

export function selectionFilters(s: InvoiceSelection, search: string): InvoicesListFilters {
  return { status: s.status || undefined, payment: s.payment === 'all' ? undefined : s.payment,
    period: s.period || undefined, search: search || undefined,
    ordering: s.ordering === DEFAULT_ORDERING ? undefined : s.ordering };
}

export function useInvoicesPageState() {
  const list = useListUrlState(DEFAULT_ORDERING);
  const status = list.param('status');
  const payment = list.param('payment');
  const period = list.param('period');
  const selection: InvoiceSelection = {
    status: status === 'issued' || status === 'paid' || status === 'cancelled' ? status : '',
    payment: payment === 'due' || payment === 'paid' || payment === 'partial' || payment === 'unpaid' ? payment : 'all',
    period: period === 'issued_month' || period === 'paid_month' ? period : '',
    ordering: list.ordering,
  };
  const apply = (s: InvoiceSelection) => list.setParams({
    status: s.status || null, payment: s.payment === 'all' ? null : s.payment,
    period: s.period || null, ordering: s.ordering === DEFAULT_ORDERING ? null : s.ordering,
  });
  const set = (patch: Partial<InvoiceSelection>) => apply({ ...selection, ...patch });
  const active: Record<InvoiceCardKey, boolean> = { due: selection.payment === 'due',
    issued_month: selection.period === 'issued_month', paid_month: selection.period === 'paid_month' };
  const toggle = (card: InvoiceCardKey) => card === 'due'
    ? set({ payment: active.due ? 'all' : 'due' })
    : set({ period: active[card] ? '' : card });
  return { ...list, selection, apply, set, active, toggle,
    filters: selectionFilters(selection, list.search),
    isFiltered: !!selection.status || selection.payment !== 'all' || !!selection.period || !!list.search };
}
export type InvoicesPageState = ReturnType<typeof useInvoicesPageState>;
