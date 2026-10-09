'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

type PaymentFilterValue = 'all' | 'due' | 'paid';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  paymentFilter: PaymentFilterValue;
  onPaymentFilterChange: (v: PaymentFilterValue) => void;
}

export function OrdersFilters({ search, onSearchChange, paymentFilter, onPaymentFilterChange }: Props) {
  const t = useTranslations('orders.list');
  const tPay = useTranslations('orders.paymentFilter');
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search size={14} className="absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <label className="sr-only">{t('search_label')}</label>
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={t('search_placeholder')}
          className="h-11 w-full rounded-full border border-border bg-card ps-9 pe-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <select
        value={paymentFilter}
        onChange={e => onPaymentFilterChange(e.target.value as PaymentFilterValue)}
        className="h-11 rounded-full border border-border bg-card px-3.5 pe-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
        aria-label={tPay('all')}
      >
        <option value="all">{tPay('all')}</option>
        <option value="due">{tPay('due')}</option>
        <option value="paid">{tPay('paid')}</option>
      </select>
    </div>
  );
}
