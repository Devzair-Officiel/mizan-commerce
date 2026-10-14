'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { orderDue } from '@/components/customers/detail/followupMessage';
import { orderNumberTag } from '@/components/orders/OrderNumber';
import { useFormatShopDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { Reminder } from '@/lib/hooks/useReminders';
import { cn } from '@/lib/utils';

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const DATE_TIME: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', ...TIME };
const LINK = 'font-medium text-foreground underline-offset-4 hover:underline';

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

/** Heure en rouge si en retard, en ambre si l'heure du jour est passée. */
function timeTone(r: Reminder): string {
  if (r.status !== 'pending') return 'text-muted-foreground';
  if (r.moment === 'overdue') return 'text-red-700 dark:text-red-400';
  if (r.moment === 'today' && new Date(r.due_at) < new Date()) return 'text-amber-700 dark:text-amber-400';
  return 'text-foreground';
}

/** Ligne d'infos d'un rappel : échéance, client, commande, reste dû d'une relance, membre chargé. */
export function ReminderRowMeta({ reminder: r, currency }: { reminder: Reminder; currency: string }) {
  const t = useTranslations('reminders.list');
  const formatDate = useFormatShopDate();
  const formatMoney = useFormatMoney();
  const timeOnly = r.status === 'pending' && (r.moment === 'today' || r.moment === 'tomorrow');
  const isFollowUp = r.category === 'customer_followup' || r.category === 'unpaid';
  const due = isFollowUp && r.order_info ? orderDue(r.order_info) : 0;
  const assignee = r.assigned_to_name?.trim();

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-muted-foreground">
      <span className={cn('inline-flex items-center gap-1.5 font-semibold tabular-nums', timeTone(r))}>
        <Clock size={14} aria-hidden />
        {formatDate(r.due_at, timeOnly ? TIME : DATE_TIME)}
      </span>
      {r.customer_info && <Link href={`/customers/${r.customer_info.id}`} className={LINK}>{r.customer_info.display_name}</Link>}
      {r.order_info && (
        <span>
          {t.rich('order_ref', {
            number: r.order_info.order_number, num: orderNumberTag,
            link: (chunks) => <Link href={`/orders/${r.order_info?.id}`} className={LINK}>{chunks}</Link>,
          })}
        </span>
      )}
      {due > 0 && (
        <span className="font-semibold text-amber-700 dark:text-amber-400">
          {t('amount_due', { amount: formatMoney(due, currency) })}
        </span>
      )}
      {assignee && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="grid size-5.5 place-items-center rounded-full bg-secondary text-[0.625rem] font-bold text-secondary-foreground">
            {initials(assignee)}
          </span>
          {t('assigned_to', { name: assignee.split(/\s+/)[0] ?? assignee })}
        </span>
      )}
    </div>
  );
}
