'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { hasPending } from './useCustomerActions';

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
        <DetailRow label={t('paid_total')}>{formatMoney(customer.paid_amount, currency)}</DetailRow>
        <DetailRow label={t('pending_total')} className={pending ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>
          {pending ? formatMoney(customer.pending_amount, currency) : '—'}
        </DetailRow>
        <DetailRow label={t('order_count')}>{customer.order_count}</DetailRow>
        <DetailRow label={t('last_order')} className={customer.last_order_at ? '' : 'font-normal text-muted-foreground'}>
          {customer.last_order_at
            ? formatDate(customer.last_order_at, { day: 'numeric', month: 'short', year: 'numeric' })
            : t('no_order')}
        </DetailRow>
      </dl>
    </SectionCard>
  );
}
