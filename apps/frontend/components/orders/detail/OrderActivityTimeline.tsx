'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { useOrderActivity, type OrderActivityEvent } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { useDayTime } from './useDayTime';

/** Phrase d'un événement : « Commande créée par Youssef », « Paiement de 30,00 € enregistré »… */
function useEventTitle() {
  const t = useTranslations('orders.activity');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();

  return (event: OrderActivityEvent): string => {
    const by = { hasActor: event.actor_name ? 'yes' : 'no', actor: event.actor_name ?? '' };
    switch (event.type) {
      case 'created': return t('event_created', by);
      case 'status_change': return t('event_status', { ...by, to: label(event.data.to ?? '') });
      case 'note': return t('event_note', by);
      case 'payment_change': {
        const delta = Number(event.data.amount_paid_after ?? 0) - Number(event.data.amount_paid_before ?? 0);
        const amount = formatMoney(Math.abs(delta), shop?.currency ?? 'EUR');
        return t(delta >= 0 ? 'event_payment_in' : 'event_payment_fix', { ...by, amount });
      }
    }
  };
}

/** Carte « Historique » : création, changements de statut, paiements et notes, du plus récent au plus ancien. */
export function OrderActivityTimeline({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.activity');
  const { format } = useDayTime();
  const titleFor = useEventTitle();
  const { data } = useOrderActivity(orderId);
  if (!data || data.events.length === 0) return null;

  return (
    <SectionCard title={t('title')}>
      <ol className="flex flex-col gap-3 px-4 py-4 lg:px-5">
        {data.events.map((event) => (
          <li key={event.id} className="flex gap-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm">{titleFor(event)}</p>
              {event.type === 'note' && event.data.content && (
                <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted-foreground wrap-break-word">{event.data.content}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">{format(event.occurred_at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
