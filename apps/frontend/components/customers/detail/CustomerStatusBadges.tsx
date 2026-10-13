'use client';

import { useTranslations } from 'next-intl';
import type { Customer } from '@/lib/hooks/useCustomers';
import { cn } from '@/lib/utils';
import { hasPending } from './useCustomerActions';

const BADGE = 'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold';

/** Badges du client : « Impayé » (ambre) s'il reste à payer, « Désactivé » (atténué). */
export function CustomerStatusBadges({ customer, className }: { customer: Customer; className?: string }) {
  const t = useTranslations('customers.detail');
  const pending = hasPending(customer);
  if (!pending && customer.is_active) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {pending && <span className={cn(BADGE, 'bg-amber-400/15 text-amber-700 dark:text-amber-300')}>{t('badge_unpaid')}</span>}
      {!customer.is_active && <span className={cn(BADGE, 'bg-muted text-muted-foreground')}>{t('badge_deactivated')}</span>}
    </div>
  );
}
