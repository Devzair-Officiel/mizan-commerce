'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Search, Settings2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { STATUSES, type StatusFilterKey } from './constants';

type PaymentFilter = 'all' | 'due' | 'paid';

interface Props {
  statusFilter: StatusFilterKey;
  onStatusFilter: (v: StatusFilterKey) => void;
  paymentFilter: PaymentFilter;
  onPaymentFilter: (v: PaymentFilter) => void;
  search: string;
  onSearch: (v: string) => void;
}

export function OrdersFiltersMobile({
  statusFilter, onStatusFilter, paymentFilter, onPaymentFilter, search, onSearch,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useTranslations('orders.list');
  const tSheet = useTranslations('orders.filterSheet');
  const tPay = useTranslations('orders.paymentFilter');
  const tStat = useTranslations('orders.statusFilter');
  const tBar = useTranslations('orders.filterBar');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const fm = shop?.fulfillment_mode ?? null;
  const activeCount = (statusFilter ? 1 : 0) + (paymentFilter !== 'all' ? 1 : 0);

  const visibleStatuses = STATUSES.filter(({ value: v }) => v !== 'prepared' || fm === 'delivery');

  const statusLabel = (v: StatusFilterKey): string => {
    if (!v) return tStat('all');
    if (v === 'to_prepare' || v === 'shipped') return label(v);
    return tStat(v as 'prepared' | 'cancelled');
  };
  const payLabel = (v: PaymentFilter): string => tPay(v as 'all' | 'due' | 'paid');

  function reset() { onStatusFilter(''); onPaymentFilter('all'); }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <label className="sr-only">{t('search_label')}</label>
          <input
            type="search" value={search} onChange={e => onSearch(e.target.value)}
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
          {activeCount > 0 && (
            <span className="absolute -top-1 -inset-e-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {statusFilter && <FilterChip label={statusLabel(statusFilter)} onRemove={() => onStatusFilter('')} removeAria={tBar('remove_filter', { name: statusLabel(statusFilter) })} />}
          {paymentFilter !== 'all' && <FilterChip label={payLabel(paymentFilter)} onRemove={() => onPaymentFilter('all')} removeAria={tBar('remove_filter', { name: payLabel(paymentFilter) })} />}
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={tSheet('title')}>
        <SheetBody
          visibleStatuses={visibleStatuses}
          statusFilter={statusFilter}
          paymentFilter={paymentFilter}
          statusLabel={statusLabel}
          payLabel={payLabel}
          onStatusFilter={onStatusFilter}
          onPaymentFilter={onPaymentFilter}
          activeCount={activeCount}
          onReset={reset}
          onClose={() => setSheetOpen(false)}
          resetLabel={tSheet('reset')}
          applyLabel={tSheet('apply')}
          statusTitle={tSheet('status_title')}
          paymentTitle={tSheet('payment_title')}
        />
      </BottomSheet>
    </div>
  );
}

interface SheetBodyProps {
  visibleStatuses: typeof STATUSES;
  statusFilter: StatusFilterKey;
  paymentFilter: PaymentFilter;
  statusLabel: (v: StatusFilterKey) => string;
  payLabel: (v: PaymentFilter) => string;
  onStatusFilter: (v: StatusFilterKey) => void;
  onPaymentFilter: (v: PaymentFilter) => void;
  activeCount: number;
  onReset: () => void;
  onClose: () => void;
  resetLabel: string;
  applyLabel: string;
  statusTitle: string;
  paymentTitle: string;
}

function SheetBody({ visibleStatuses, statusFilter, paymentFilter, statusLabel, payLabel, onStatusFilter, onPaymentFilter, activeCount, onReset, onClose, resetLabel, applyLabel, statusTitle, paymentTitle }: SheetBodyProps) {
  return (
    <div className="flex flex-col gap-5">
      <FilterSection title={statusTitle}>
        {visibleStatuses.map(({ value: v, dot }) => (
          <FilterOption key={v} label={statusLabel(v)} dot={dot} isActive={statusFilter === v} onClick={() => onStatusFilter(v)} />
        ))}
      </FilterSection>
      <FilterSection title={paymentTitle}>
        {(['all', 'due', 'paid'] as PaymentFilter[]).map(v => (
          <FilterOption key={v} label={payLabel(v)} isActive={paymentFilter === v} onClick={() => onPaymentFilter(v)} />
        ))}
      </FilterSection>
      <div className="flex items-center gap-2 pt-2">
        <button onClick={onReset} disabled={activeCount === 0}
          className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground disabled:opacity-40 active:scale-[0.98] transition-transform whitespace-nowrap">
          {resetLabel}
        </button>
        <button onClick={onClose}
          className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform whitespace-nowrap">
          {applyLabel}
        </button>
      </div>
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
    <button type="button" onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'}`}>
      {dot && <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />}
      <span className="flex-1">{label}</span>
      {isActive && <Check size={16} className="shrink-0" />}
    </button>
  );
}
