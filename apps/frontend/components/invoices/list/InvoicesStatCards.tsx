'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, FileText } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvoicesSummary } from '@/lib/hooks/useInvoices';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { InvoicesPageState } from './useInvoicesPageState';

export function InvoicesStatCards({ state, currency }: { state: InvoicesPageState; currency: string }) {
  const t = useTranslations('invoices.list');
  const money = useFormatMoney();
  const { data } = useInvoicesSummary();
  return (
    <div className="grid grid-cols-2 gap-3 max-lg:*:last:odd:col-span-2 lg:grid-cols-3 lg:gap-4">
      {!data ? [0, 1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />) : <>
        <StatCard label={t('stats.due')} value={money(data.due.amount, currency)} sub={t('count', { count: data.due.count })}
          icon={<Clock size={16} />} tone="amber" toneValue pressed={state.active.due} onClick={() => state.toggle('due')} />
        <StatCard label={t('stats.issued_month')} value={data.issued_month.count} sub={money(data.issued_month.amount, currency)}
          icon={<FileText size={16} />} pressed={state.active.issued_month} onClick={() => state.toggle('issued_month')} />
        <StatCard label={t('stats.paid_month')} value={data.paid_month.count} sub={money(data.paid_month.amount, currency)}
          icon={<CheckCircle2 size={16} />} tone="green" pressed={state.active.paid_month} onClick={() => state.toggle('paid_month')} />
      </>}
    </div>
  );
}
