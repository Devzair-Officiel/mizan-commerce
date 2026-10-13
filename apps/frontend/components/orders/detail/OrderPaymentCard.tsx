'use client';

import { useTranslations } from 'next-intl';
import { Banknote, Pencil } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { buttonVariants } from '@/components/ui/button';
import { OrderPaymentBadge } from '@/components/orders/list/OrderPaymentBadge';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Order } from '@/lib/hooks/useOrders';
import { cn } from '@/lib/utils';
import { remainingDue, WhatsAppIcon } from './constants';
import type { OrderDetailActions } from './useOrderDetailState';

const OUTLINE = cn(buttonVariants({ variant: 'outline' }), 'h-10 flex-1 rounded-full bg-card px-4 font-medium');

interface OrderPaymentCardProps {
  order: Order;
  actions: OrderDetailActions;
  /** L'encaissement est déjà l'action principale de la page : pas de second bouton. */
  collectIsPrimary: boolean;
}

/** Carte « Paiement » : payé sur total, progression, reste dû, encaisser ou relancer. */
export function OrderPaymentCard({ order, actions, collectIsPrimary }: OrderPaymentCardProps) {
  const t = useTranslations('orders.paymentCard');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });
  const total = parseFloat(order.total_amount);
  const due = remainingDue(order);
  const progress = total > 0 ? Math.min(100, Math.round((parseFloat(order.amount_paid) / total) * 100)) : 0;
  const open = order.status !== 'cancelled';
  const canCollect = open && due > 0 && !collectIsPrimary;
  const canRemind = open && due > 0 && !!order.customer && !!order.customer_phone;

  return (
    <SectionCard title={t('title')} rightSlot={<OrderPaymentBadge order={order} currency={currency} showDue={false} />}>
      <div className="px-4 py-4 lg:px-5">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-2xl font-bold tabular-nums">{money(order.amount_paid)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{t('of_total', { amount: money(total) })}</span>
        </p>
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('progress_label')}
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all duration-300',
            order.payment_status === 'paid' ? 'bg-green-700 dark:bg-green-400' : 'bg-amber-600 dark:bg-amber-400')}
            style={{ width: `${progress}%` }} />
        </div>
        {due > 0 && (
          <p className="mt-2 text-[0.8125rem] font-semibold text-amber-700 tabular-nums dark:text-amber-400">
            {t('remaining', { amount: money(due) })}
          </p>
        )}
        {(canCollect || canRemind) && (
          <div className="mt-3.5 flex gap-2">
            {canCollect && (
              <button type="button" className={OUTLINE} onClick={() => actions.openPayment(due)}>
                <Banknote className="text-primary" aria-hidden />{t('collect_cta')}
              </button>
            )}
            {canRemind && (
              <button type="button" className={OUTLINE} onClick={() => actions.openWhatsApp('unpaid_followup')}>
                <span className="text-primary"><WhatsAppIcon size={16} /></span>{t('remind_cta')}
              </button>
            )}
          </div>
        )}
        {open && (
          <button type="button" onClick={() => actions.openPayment(0)}
            className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-primary hover:underline">
            <Pencil size={14} aria-hidden />{t('correct_cta')}
          </button>
        )}
      </div>
    </SectionCard>
  );
}
