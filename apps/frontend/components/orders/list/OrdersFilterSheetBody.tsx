'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { STATUSES } from './constants';
import { useOrderFilterOptions } from './useOrderFilterOptions';
import type { OrdersPageState } from './useOrdersPageState';

/** Tris proposés sur mobile : date et montant, dans les deux sens. */
const MOBILE_SORTS = [
  { ordering: '-created_at', key: 'sort_newest' },
  { ordering: 'created_at', key: 'sort_oldest' },
  { ordering: '-total_amount', key: 'sort_amount_desc' },
  { ordering: 'total_amount', key: 'sort_amount_asc' },
] as const;

const DOTS = Object.fromEntries(STATUSES.map((s) => [s.value, s.dot]));

interface Props {
  state: OrdersPageState;
  activeCount: number;
  onClose: () => void;
}

export function OrdersFilterSheetBody({ state, activeCount, onClose }: Props) {
  const t = useTranslations('orders.filterSheet');
  const { statusOptions, paymentOptions } = useOrderFilterOptions();
  return (
    <div className="flex flex-col gap-5">
      <FilterSection title={t('sort_title')}>
        {MOBILE_SORTS.map(({ ordering, key }) => (
          <FilterOption key={ordering} label={t(key)} isActive={state.ordering === ordering}
            onClick={() => state.setOrdering(ordering)} />
        ))}
      </FilterSection>
      <FilterSection title={t('status_title')}>
        {statusOptions.map(({ value, label }) => (
          <FilterOption key={value} label={label} dot={DOTS[value]} isActive={state.statusFilter === value}
            onClick={() => state.handleStatusFilter(value)} />
        ))}
      </FilterSection>
      <FilterSection title={t('payment_title')}>
        {paymentOptions.map(({ value, label }) => (
          <FilterOption key={value} label={label} isActive={state.paymentFilter === value}
            onClick={() => state.handlePaymentFilter(value)} />
        ))}
      </FilterSection>
      <div className="flex items-center gap-2 pt-2">
        <button onClick={state.resetFilters} disabled={activeCount === 0}
          className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground disabled:opacity-40 active:scale-[0.98] transition-transform whitespace-nowrap">
          {t('reset')}
        </button>
        <button onClick={onClose}
          className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform whitespace-nowrap">
          {t('apply')}
        </button>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function FilterOption({ label, dot, isActive, onClick }: { label: string; dot?: string | null; isActive: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={isActive}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-start transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'}`}>
      {dot && <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />}
      <span className="flex-1">{label}</span>
      {isActive && <Check size={16} className="shrink-0" />}
    </button>
  );
}
