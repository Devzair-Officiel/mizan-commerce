'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import type { OrderSummary } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';

/** Commandes non réglées apparues après la création de la fiche (Q3) : à ajouter une par une ou toutes. */
export function NewOrdersCard({ orders, format, onAdd }: { orders: OrderSummary[]; format: ZakatFormat; onAdd: (orders: OrderSummary[]) => void }) {
  const t = useTranslations('zakat.steps.receivables');
  return (
    <SectionCard title={t('new_title')} description={t('new_hint')} wrap rightSlot={orders.length > 1 && (
      <button type="button" onClick={() => onAdd(orders)} className={`${HEADER_LINK} relative after:absolute after:-inset-1.5`}>{t('new_add_all')}</button>
    )}>
      <ul>
        {orders.map((order) => (
          <li key={order.order_id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 lg:px-5">
            <div className="min-w-0 flex-1">
              <p dir="auto" className="text-sm font-semibold text-foreground">{order.customer_name ?? order.order_number}</p>
              {order.order_number && order.created_at && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('order_line', { number: order.order_number, date: format.shortDate(order.created_at) })}
                </p>
              )}
            </div>
            <span className="text-sm font-semibold whitespace-nowrap text-foreground tabular-nums">{order.remaining ? format.money(order.remaining) : null}</span>
            <button type="button" onClick={() => onAdd([order])}
              className="min-h-11 rounded-full px-3 text-[0.8125rem] font-semibold whitespace-nowrap text-primary outline-none hover:bg-primary/7 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-primary/30">
              {t('new_add')}
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
