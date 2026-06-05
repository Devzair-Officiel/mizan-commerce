'use client';

import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Order } from '@/lib/hooks/useOrders';

interface OrderItemsCardProps {
  order: Order;
  totalAmount: number;
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
}

export function OrderItemsCard({
  order, totalAmount, subtotalAmount, discountAmount, shippingAmount,
}: OrderItemsCardProps) {
  const t = useTranslations('orders.items');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const hasAdjustments = discountAmount > 0 || shippingAmount > 0;

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t('title')}
          </h2>
          <span className="text-xs text-zinc-400 tabular-nums">
            {t('unit_count', { count: itemCount })}
          </span>
        </div>
        {order.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-400">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 tabular-nums">
                  ×{item.quantity}
                </span>
                <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                  <span className="text-sm font-medium text-zinc-900 truncate">{item.product_name}</span>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {t('unit_price_short', { amount: money(item.unit_price) })}
                  </span>
                </div>
                <span className="text-sm font-semibold text-zinc-900 tabular-nums shrink-0">
                  {money(item.line_total)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!hasAdjustments && order.items.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-50/60 border-t border-zinc-100">
            <span className="text-sm font-semibold text-zinc-900">{t('total')}</span>
            <span className="text-base font-bold text-zinc-900 tabular-nums">
              {money(totalAmount)}
            </span>
          </div>
        )}
      </div>

      {hasAdjustments && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-2 shadow-sm">
          <div className="flex justify-between text-sm text-zinc-500">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums">{money(subtotalAmount)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>{t('discount')}</span>
              <span className="tabular-nums">− {money(discountAmount)}</span>
            </div>
          )}
          {shippingAmount > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>{t('shipping')}</span>
              <span className="tabular-nums">+ {money(shippingAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-zinc-900 pt-2 border-t border-zinc-100">
            <span>{t('total')}</span>
            <span className="tabular-nums">{money(totalAmount)}</span>
          </div>
        </div>
      )}
    </>
  );
}
