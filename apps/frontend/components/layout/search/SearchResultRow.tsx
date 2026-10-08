'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { SearchHighlight } from './SearchHighlight';
import type { SearchProduct, SearchCustomer, SearchOrder } from '@/lib/hooks/useSearch';

const ROW_BASE = 'flex items-center justify-between px-4 py-3.5 text-start bg-card hover:bg-muted active:bg-muted transition-colors border-t border-border first:border-t-0 cursor-pointer min-h-14 outline-none focus-visible:bg-muted';

export function ProductResultRow({ item, query, isActive, id, onClick }: {
  item: SearchProduct; query: string; isActive: boolean; id: string; onClick: () => void;
}) {
  const t = useTranslations('layout.search');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  return (
    <div role="option" id={id} aria-selected={isActive} tabIndex={-1} onClick={onClick}
      className={`${ROW_BASE} ${isActive ? 'bg-muted' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate"><SearchHighlight text={item.name} query={query} /></p>
        {item.reference && <p className="text-xs text-muted-foreground truncate">{item.reference}</p>}
      </div>
      <div className="shrink-0 ms-3 text-end">
        {item.min_price && (
          <p className="text-xs font-medium text-foreground tabular-nums">
            {formatMoney(item.min_price, shop?.currency ?? 'EUR', { maximumFractionDigits: 2 })}
          </p>
        )}
        {item.type === 'product' && item.is_out_of_stock && (
          <p className="text-xs text-destructive font-medium">{t('out_of_stock')}</p>
        )}
      </div>
    </div>
  );
}

export function CustomerResultRow({ item, query, isActive, id, onClick }: {
  item: SearchCustomer; query: string; isActive: boolean; id: string; onClick: () => void;
}) {
  return (
    <div role="option" id={id} aria-selected={isActive} tabIndex={-1} onClick={onClick}
      className={`${ROW_BASE} ${isActive ? 'bg-muted' : ''}`}>
      <p className="text-sm text-foreground flex-1 min-w-0 truncate">
        <SearchHighlight text={item.name} query={query} />
      </p>
      <div className="flex gap-3 text-xs text-muted-foreground shrink-0 ms-3">
        {item.phone && <span className="tabular-nums">{item.phone}</span>}
        {item.city && <span>{item.city}</span>}
      </div>
    </div>
  );
}

export function OrderResultRow({ item, query, isActive, id, onClick }: {
  item: SearchOrder; query: string; isActive: boolean; id: string; onClick: () => void;
}) {
  const t = useTranslations('orders.new');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const statusLabel = useOrderStatusLabel();
  return (
    <div role="option" id={id} aria-selected={isActive} tabIndex={-1} onClick={onClick}
      className={`${ROW_BASE} ${isActive ? 'bg-muted' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground"><SearchHighlight text={item.order_number} query={query} /></p>
        <p className="text-xs text-muted-foreground">{item.customer_name ?? t('no_customer_name')}</p>
      </div>
      <div className="shrink-0 ms-3 text-end">
        <p className="text-xs text-muted-foreground">{statusLabel(item.status)}</p>
        <p className="text-xs font-medium text-foreground tabular-nums">
          {formatMoney(item.total_amount, shop?.currency ?? 'EUR', { maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
}
