'use client';

import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { LineItem } from './types';

interface OrderItemsListProps {
  items: LineItem[];
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
}

export function OrderItemsList({ items, onUpdateQty, onRemove }: OrderItemsListProps) {
  const t = useTranslations('orders.new');
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('items_title')}
        </span>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <OrderItemRow
            key={item.lineId}
            item={item}
            onUpdateQty={onUpdateQty}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}

function OrderItemRow({
  item, onUpdateQty, onRemove,
}: {
  item: LineItem;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
}) {
  const t = useTranslations('orders.new');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const unitPrice = parseFloat(item.unit_price);
  const lineTotal = unitPrice * item.quantity;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{item.product_name}</span>
            {item.product_type === 'service' && (
              <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                {t('service_badge')}
              </span>
            )}
            {item.variant === null && (
              <span className="shrink-0 rounded-full bg-muted text-muted-foreground border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                {t('free_badge')}
              </span>
            )}
          </div>
          {item.variant_name && item.variant_name !== 'Par défaut' && (
            <span className="text-[11px] text-muted-foreground truncate">{item.variant_name}</span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('unit_per', { amount: money(unitPrice) })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.lineId)}
          aria-label={t('remove_item_aria')}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 -mr-1 p-1"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdateQty(item.lineId, item.quantity - 1)}
            aria-label={t('decrease_aria')}
            className="w-9 h-9 rounded-full border border-border text-foreground text-base flex items-center justify-center active:bg-muted active:scale-95 transition-all"
          >−</button>
          <span className="w-7 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
          <button
            type="button"
            onClick={() => onUpdateQty(item.lineId, item.quantity + 1)}
            aria-label={t('increase_aria')}
            className="w-9 h-9 rounded-full border border-border text-foreground text-base flex items-center justify-center active:bg-muted active:scale-95 transition-all"
          >+</button>
        </div>
        <span className="text-sm font-bold text-foreground tabular-nums">
          {money(lineTotal)}
        </span>
      </div>
    </div>
  );
}
