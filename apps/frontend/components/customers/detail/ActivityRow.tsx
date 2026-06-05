'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CreditCard, FileText, ShoppingBag, Truck } from 'lucide-react';
import type { ActivityEvent } from '@/lib/hooks/useCustomers';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatDateTime, useFormatMoney } from '@/lib/hooks/useFormat';
import { PAYMENT_TITLE_KEY, PAYMENT_TONE } from './constants';

export function ActivityRow({ item, customerId }: { item: ActivityEvent; customerId: string }) {
  const t = useTranslations('customers.activity');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const formatDateTime = useFormatDateTime();
  const currency = shop?.currency ?? 'EUR';
  const date = formatDateTime(item.occurred_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fromQuery = `?from=/customers/${customerId}`;

  if (item.type === 'order') {
    return (
      <EventLink href={`/orders/${item.data.order_id}${fromQuery}`}>
        <EventIcon className="bg-primary/10 text-primary"><ShoppingBag size={16} /></EventIcon>
        <EventBody
          title={t('order_created')}
          subtitle={t('order_sub', {
            number: item.data.order_number,
            amount: formatMoney(item.data.total_amount, currency, { maximumFractionDigits: 2 }),
          })}
          date={date}
        />
      </EventLink>
    );
  }

  if (item.type === 'payment') {
    const status = item.data.payment_status;
    const titleKey = PAYMENT_TITLE_KEY[status];
    return (
      <EventLink href={`/orders/${item.data.order_id}${fromQuery}`}>
        <EventIcon className={PAYMENT_TONE[status] ?? ''}><CreditCard size={16} /></EventIcon>
        <EventBody
          title={titleKey ? t(titleKey) : t('payment_fallback')}
          subtitle={t('payment_sub', {
            amount: formatMoney(item.data.amount_paid, currency, { maximumFractionDigits: 2 }),
            number: item.data.order_number,
          })}
          date={date}
        />
      </EventLink>
    );
  }

  if (item.type === 'shipment') {
    return (
      <EventLink href={`/orders/${item.data.order_id}${fromQuery}`}>
        <EventIcon className="bg-blue-500/10 text-blue-600 dark:text-blue-400"><Truck size={16} /></EventIcon>
        <EventBody
          title={t('shipment_title')}
          subtitle={t('shipment_sub', { number: item.data.order_number })}
          date={date}
        />
      </EventLink>
    );
  }

  const noteHref = item.data.order_id ? `/orders/${item.data.order_id}${fromQuery}` : null;
  const inner = (
    <>
      <EventIcon className="bg-muted text-muted-foreground"><FileText size={16} /></EventIcon>
      <EventBody
        title={t('note_title')}
        subtitle={item.data.content}
        meta={item.data.author_name ?? undefined}
        date={date}
      />
    </>
  );
  return noteHref ? (
    <EventLink href={noteHref}>{inner}</EventLink>
  ) : (
    <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
  );
}

export function ActivitySkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-4 py-3" aria-hidden>
      <div className="h-9 w-9 shrink-0 rounded-xl bg-muted animate-pulse mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
        <div className="h-3 w-44 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-3 w-12 rounded bg-muted animate-pulse mt-1" />
    </div>
  );
}

function EventLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-start gap-3 px-4 py-3 active:bg-muted transition-colors">
      {children}
    </Link>
  );
}

function EventIcon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 ${className}`}>
      {children}
    </div>
  );
}

function EventBody({
  title,
  subtitle,
  meta,
  date,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  date: string;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {meta ? `${meta} · ` : ''}{subtitle}
        </span>
      </div>
      <span className="text-xs font-medium text-foreground/60 dark:text-foreground/55 shrink-0 mt-0.5">{date}</span>
    </>
  );
}
