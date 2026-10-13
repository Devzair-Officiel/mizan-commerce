'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { isDefaultVariant } from '@/lib/products';
import type { Order, OrderItem } from '@/lib/hooks/useOrders';

function ItemRow({ item, money }: { item: OrderItem; money: (v: string) => string }) {
  const t = useTranslations('orders.items');
  const unit = t('unit_price', { amount: money(item.unit_price) });
  const showVariant = item.variant_name && !isDefaultVariant(item.variant_name);
  return (
    <li className="flex items-center gap-3.5 px-4 py-3 lg:px-5">
      <span className="flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full bg-muted px-2 text-[0.8125rem] font-semibold tabular-nums">
        ×{item.quantity}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{item.product_name}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
          {showVariant ? t('variant_unit', { variant: item.variant_name, unit }) : unit}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.line_total)}</span>
    </li>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Carte « Articles » : lignes de la commande, puis sous-total, remise, livraison et total. */
export function OrderItemsCard({ order }: { order: Order }) {
  const t = useTranslations('orders.items');
  const { data: shop } = useShop();
  const kind = useCatalogKind();
  const formatMoney = useFormatMoney();
  const money = (v: string) => formatMoney(v, shop?.currency ?? 'EUR', { maximumFractionDigits: 2 });
  const units = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const discount = parseFloat(order.discount_amount) > 0;
  const shipping = parseFloat(order.shipping_amount) > 0;

  return (
    <SectionCard title={t('title', { kind })}
      rightSlot={<span className="text-muted-foreground tabular-nums">{t('unit_count', { count: units })}</span>}>
      {order.items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t('empty', { kind })}</p>
      ) : (
        <ul className="divide-y divide-border">
          {order.items.map((item) => <ItemRow key={item.id} item={item} money={money} />)}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-4 text-sm lg:px-5">
        {(discount || shipping) && <TotalLine label={t('subtotal')} value={money(order.subtotal)} />}
        {discount && <TotalLine label={t('discount')} value={`−${money(order.discount_amount)}`} />}
        {shipping && <TotalLine label={t('shipping')} value={`+${money(order.shipping_amount)}`} />}
        <div className={`flex items-baseline justify-between gap-3 ${discount || shipping ? 'border-t border-border pt-2.5' : ''}`}>
          <span className="font-semibold">{t('total')}</span>
          <span className="text-xl font-bold tabular-nums">{money(order.total_amount)}</span>
        </div>
      </div>
    </SectionCard>
  );
}
