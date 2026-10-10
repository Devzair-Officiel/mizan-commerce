'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { CustomerSummary } from '@/lib/hooks/useCustomers';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from '../CustomerAvatar';

interface CustomerRowProps {
  customer: CustomerSummary;
  first: boolean;
  currency: string;
}

/**
 * Ligne de la liste mobile, avec le vocabulaire du tableau : téléphone et ville
 * sous le nom ; à droite le reste à payer en ambre, sinon le total payé et la
 * dernière commande. Un client désactivé est atténué.
 */
export function CustomerRow({ customer, first, currency }: CustomerRowProps) {
  const t = useTranslations('customers.list');
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const hasPending = parseFloat(customer.pending_amount) > 0;
  const city = customer.city?.trim();

  return (
    <Link
      href={`/customers/${customer.id}`}
      className={cn('flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted', !first && 'border-t border-border')}
    >
      <CustomerAvatar name={customer.name} className={cn('size-11', !customer.is_active && 'opacity-60')} />
      <div className={cn('min-w-0 flex-1', !customer.is_active && 'opacity-60')}>
        <div className="flex items-center gap-2">
          <span dir="auto" className="truncate font-semibold capitalize text-foreground">{customer.name}</span>
          {!customer.is_active && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">
              {t('deactivated_badge')}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          <span dir="ltr">{customer.phone || t('phone_missing')}</span>
          {city && <> · {city}</>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end leading-tight">
        {hasPending ? (
          <>
            <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {formatMoney(customer.pending_amount, currency)}
            </span>
            <span className="text-[0.6875rem] font-medium text-amber-700/80 dark:text-amber-400/80">{t('pending_short')}</span>
          </>
        ) : customer.last_order_at ? (
          <>
            <span className="text-sm tabular-nums text-foreground">{formatMoney(customer.paid_amount, currency)}</span>
            <span className="text-[0.6875rem] text-muted-foreground">
              {formatDate(customer.last_order_at, { day: 'numeric', month: 'short' })}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t('no_orders')}</span>
        )}
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
    </Link>
  );
}
