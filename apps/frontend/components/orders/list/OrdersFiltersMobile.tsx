'use client';

import { useState } from 'react';
import { Search, Settings2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { OrdersFilterSheetBody } from './OrdersFilterSheetBody';
import { useOrderFilterOptions } from './useOrderFilterOptions';
import type { OrdersPageState } from './useOrdersPageState';

export function OrdersFiltersMobile({ state }: { state: OrdersPageState }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useTranslations('orders.list');
  const tSheet = useTranslations('orders.filterSheet');
  const tPay = useTranslations('orders.paymentFilter');
  const tBar = useTranslations('orders.filterBar');
  const { statusLabel } = useOrderFilterOptions();
  const { statusFilter, paymentFilter, isMonth } = state;

  const chips = [
    statusFilter && { label: statusLabel(statusFilter), remove: () => state.handleStatusFilter('') },
    paymentFilter !== 'all' && { label: tPay(paymentFilter), remove: () => state.handlePaymentFilter('all') },
    isMonth && { label: t('stats.month_label'), remove: () => state.handlePeriod(false) },
  ].filter((c): c is { label: string; remove: () => void } => !!c);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <label className="sr-only" htmlFor="orders-search-mobile">{t('search_label')}</label>
          <input
            id="orders-search-mobile"
            type="search" value={state.searchInput} onChange={e => state.setSearchInput(e.target.value)}
            placeholder={t('search_placeholder')}
            className="h-11 w-full rounded-full border border-border bg-card ps-9 pe-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button" onClick={() => setSheetOpen(true)}
          className="relative h-11 shrink-0 flex items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground whitespace-nowrap"
        >
          <Settings2 size={15} />
          {tBar('filters_btn')}
          {chips.length > 0 && (
            <span className="absolute -top-1 -inset-e-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {chips.length}
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <FilterChip key={chip.label} label={chip.label} onRemove={chip.remove}
              removeAria={tBar('remove_filter', { name: chip.label })} />
          ))}
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={tSheet('title')}>
        <OrdersFilterSheetBody state={state} activeCount={chips.length} onClose={() => setSheetOpen(false)} />
      </BottomSheet>
    </div>
  );
}

function FilterChip({ label, onRemove, removeAria }: { label: string; onRemove: () => void; removeAria: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium px-3 py-1.5">
      {label}
      <button type="button" onClick={onRemove} aria-label={removeAria}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full -me-0.5 hover:bg-secondary-foreground/20">
        <X size={10} />
      </button>
    </span>
  );
}
