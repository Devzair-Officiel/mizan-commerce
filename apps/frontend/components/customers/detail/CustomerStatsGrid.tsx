'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ClipboardPlus, CreditCard } from 'lucide-react';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';

interface CustomerStatsGridProps {
  customer: Customer;
  pendingOnly: boolean;
  onTogglePendingFilter: () => void;
}

export function CustomerStatsGrid({
  customer, pendingOnly, onTogglePendingFilter,
}: CustomerStatsGridProps) {
  const t = useTranslations('customers.stats');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const currency = shop?.currency ?? 'EUR';
  const hasPending = parseFloat(customer.pending_amount) > 0;
  const amountFmt = formatMoney(customer.pending_amount, currency, { maximumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-2 gap-3">
      {hasPending ? (
        <button
          type="button"
          onClick={onTogglePendingFilter}
          aria-pressed={pendingOnly}
          className={`rounded-2xl border bg-card p-4 flex flex-col gap-2 text-left transition-all active:scale-[0.98] ${
            pendingOnly
              ? 'border-amber-400/60 ring-2 ring-amber-400/30'
              : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t('to_collect')}</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
              <CreditCard size={14} />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{amountFmt}</p>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {pendingOnly ? t('filter_active') : t('filter_hint')}
          </p>
        </button>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t('to_collect')}</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{amountFmt}</p>
          <p className="text-xs font-medium text-green-600 dark:text-green-400">{t('up_to_date')}</p>
        </div>
      )}

      <Link
        href={`/orders/new?customer=${customer.id}&from=/customers/${customer.id}`}
        className="rounded-2xl bg-primary p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
          <ClipboardPlus size={20} />
        </div>
        <p className="text-sm font-semibold text-primary-foreground">{t('new_order')}</p>
      </Link>
    </div>
  );
}
