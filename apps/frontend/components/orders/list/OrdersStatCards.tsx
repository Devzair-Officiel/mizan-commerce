'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, ShoppingBag } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { useOrdersSummary } from '@/lib/hooks/useOrders';
import { useFormatMoney, useRelativeTime } from '@/lib/hooks/useFormat';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import type { OrdersStatCardKey } from './useOrdersPageState';

interface OrdersStatCardsProps {
  currency: string;
  active: Record<OrdersStatCardKey, boolean>;
  onToggle: (card: OrdersStatCardKey) => void;
}

/** Indicateurs de la page Commandes (desktop uniquement) : chacun bascule son filtre. */
export function OrdersStatCards({ currency, active, onToggle }: OrdersStatCardsProps) {
  const t = useTranslations('orders.list.stats');
  const tPay = useTranslations('orders.paymentFilter');
  const formatMoney = useFormatMoney();
  const relativeTime = useRelativeTime();
  const label = useOrderStatusLabel();
  const { data } = useOrdersSummary();

  if (!data) return <div className="h-32.5" aria-hidden />;

  const oldest = data.to_prepare.oldest_created_at;
  const shipped = data.month.shipped_count;
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        label={label('to_prepare', true)}
        value={data.to_prepare.count}
        sub={oldest ? t('to_prepare_sub', { age: relativeTime(oldest) }) : t('to_prepare_none')}
        icon={<ShoppingBag size={16} />}
        onClick={() => onToggle('to_prepare')}
        pressed={active.to_prepare}
      />
      <StatCard
        label={tPay('due')}
        value={formatMoney(data.due.amount, currency)}
        sub={t('due_sub', { count: data.due.count })}
        icon={<Clock size={16} />}
        tone="amber"
        toneValue
        onClick={() => onToggle('due')}
        pressed={active.due}
      />
      <StatCard
        label={t('month_label')}
        value={formatMoney(data.month.revenue, currency)}
        sub={t('month_sub', { count: shipped, state: label('shipped', shipped > 1).toLocaleLowerCase() })}
        icon={<CheckCircle2 size={16} />}
        tone="green"
        onClick={() => onToggle('month')}
        pressed={active.month}
      />
    </div>
  );
}
