'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { cn } from '@/lib/utils';
import { hasPending } from './useCustomerActions';

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3 lg:px-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm font-semibold tabular-nums', className)}>{children}</dd>
    </div>
  );
}

/** Carte « Situation » : total payé, reste à payer, nombre de commandes, dernière commande. */
export function CustomerSituationCard({ customer }: { customer: Customer }) {
  const t = useTranslations('customers.detail');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const currency = shop?.currency ?? 'EUR';
  const pending = hasPending(customer);

  return (
    <SectionCard title={t('situation_title')}>
      <dl className="divide-y divide-border">
        <Row label={t('paid_total')}>{formatMoney(customer.paid_amount, currency)}</Row>
        <Row label={t('pending_total')} className={pending ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>
          {pending ? formatMoney(customer.pending_amount, currency) : '—'}
        </Row>
        <Row label={t('order_count')}>{customer.order_count}</Row>
        <Row label={t('last_order')} className={customer.last_order_at ? '' : 'font-normal text-muted-foreground'}>
          {customer.last_order_at
            ? formatDate(customer.last_order_at, { day: 'numeric', month: 'short', year: 'numeric' })
            : t('no_order')}
        </Row>
      </dl>
    </SectionCard>
  );
}
