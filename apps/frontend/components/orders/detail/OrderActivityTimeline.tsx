'use client';

import { useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { useOrderActivity } from '@/lib/hooks/useOrders';
import { useFormatDateTime, useRelativeTime } from '@/lib/hooks/useFormat';
import { describeEvent } from './constants';

interface OrderActivityTimelineProps {
  orderId: string;
}

const STATUS_KEYS = new Set(['draft', 'to_prepare', 'prepared', 'shipped', 'cancelled']);
const PAYMENT_KEYS = new Set(['unpaid', 'partial', 'paid']);

export function OrderActivityTimeline({ orderId }: OrderActivityTimelineProps) {
  const t = useTranslations('orders.activity');
  const tStatus = useTranslations('orders.statusFilter');
  const tPayment = useTranslations('orders.payment');
  const formatDateTime = useFormatDateTime();
  const relativeTime = useRelativeTime();
  const { data } = useOrderActivity(orderId);
  if (!data || data.events.length === 0) return null;

  function translateStatus(raw: string): string {
    return STATUS_KEYS.has(raw) ? tStatus(raw as 'draft') : raw;
  }
  function translatePayment(raw: string): string {
    return PAYMENT_KEYS.has(raw) ? tPayment(raw as 'unpaid') : raw;
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-100">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <History size={14} />
          {t('title')}
        </h2>
      </div>
      <ol className="divide-y divide-zinc-100">
        {data.events.map((event) => {
          const disp = describeEvent(event);
          let title: string;
          if (disp.titleKey === 'event_status') {
            title = t('event_status', {
              from: translateStatus(disp.titleParams?.from ?? ''),
              to: translateStatus(disp.titleParams?.to ?? ''),
            });
          } else if (disp.titleKey === 'event_payment') {
            title = t('event_payment', {
              from: translatePayment(disp.titleParams?.from ?? ''),
              to: translatePayment(disp.titleParams?.to ?? ''),
            });
          } else {
            title = t(disp.titleKey);
          }
          const fullTimestamp = formatDateTime(event.occurred_at, {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          });
          return (
            <li key={event.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${disp.iconBg}`}>
                {disp.icon}
              </span>
              <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                <p className="text-sm font-medium text-zinc-900">{title}</p>
                {disp.body && (
                  <p className="text-xs text-zinc-500 whitespace-pre-wrap wrap-break-word">{disp.body}</p>
                )}
                <p className="text-xs text-zinc-400">
                  {event.actor_name ? `${event.actor_name} · ` : ''}
                  <span title={fullTimestamp}>
                    {relativeTime(event.occurred_at)}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
