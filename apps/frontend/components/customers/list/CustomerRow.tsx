'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { CustomerSummary } from '@/lib/hooks/useCustomers';
import { useFormatMoney } from '@/lib/hooks/useFormat';

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-primary/15 text-primary',
];

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

interface CustomerRowProps {
  customer: CustomerSummary;
  first: boolean;
  currency: string;
}

export function CustomerRow({ customer, first, currency }: CustomerRowProps) {
  const t = useTranslations('customers.list');
  const formatMoney = useFormatMoney();
  const pending = parseFloat(customer.pending_amount);
  const hasPending = pending > 0;
  const subtitle = customer.phone || t('phone_missing');
  const city = customer.city?.trim();

  return (
    <Link
      href={`/customers/${customer.id}`}
      className={`flex items-center gap-3 px-4 py-3.5 active:bg-muted transition-colors ${
        first ? '' : 'border-t border-border'
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(customer.name)}`}>
        {getInitials(customer.name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize truncate">{customer.name}</span>
          {!customer.is_active && (
            <span className="shrink-0 rounded-full bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
              {t('deactivated_badge')}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/70 mt-0.5 truncate">
          {subtitle}
          {city && <span className="text-muted-foreground"> · {city}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasPending && (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {formatMoney(pending, currency, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80">{t('pending_to_collect')}</span>
          </div>
        )}
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </Link>
  );
}
