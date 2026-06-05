'use client';

import { useTranslations } from 'next-intl';
import { CreditCard, Pencil, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Order } from '@/lib/hooks/useOrders';
import { PAYMENT_COLOR } from './constants';

interface OrderPaymentCardProps {
  order: Order;
  totalAmount: number;
  paidAmount: number;
  remaining: string;
  isPending: boolean;
  onCollect: (preset: number) => void;
}

export function OrderPaymentCard({
  order, totalAmount, paidAmount, remaining, isPending, onCollect,
}: OrderPaymentCardProps) {
  const t = useTranslations('orders.paymentCard');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const paymentProgress = totalAmount > 0
    ? Math.min(100, Math.round((paidAmount / totalAmount) * 100))
    : 0;
  const remainingNum = parseFloat(remaining);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Wallet size={14} />
          {t('title')}
        </h2>
        <span className={`text-sm font-semibold ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
          {order.payment_status_display}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-zinc-900 tabular-nums">
              {money(paidAmount)}
            </span>
            <span className="text-sm text-zinc-400 tabular-nums">
              / {money(totalAmount)}
            </span>
          </div>
          <span className="text-xs font-medium text-zinc-500 tabular-nums">
            {paymentProgress}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              order.payment_status === 'paid' ? 'bg-green-500'
              : order.payment_status === 'partial' ? 'bg-amber-500'
              : 'bg-zinc-300'
            }`}
            style={{ width: `${paymentProgress}%` }}
          />
        </div>
        {remainingNum > 0 && (
          <p className="text-xs font-medium text-red-500 tabular-nums">
            {t('remaining', { amount: money(remaining) })}
          </p>
        )}
      </div>

      {order.status !== 'cancelled' && (
        remainingNum > 0 ? (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white inline-flex items-center justify-center gap-2"
            onClick={() => onCollect(remainingNum)}
            disabled={isPending}
          >
            <CreditCard size={16} />
            {t('collect_cta')}
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => onCollect(0)}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 py-1"
          >
            <Pencil size={12} />
            {t('correct_cta')}
          </button>
        )
      )}
    </div>
  );
}
