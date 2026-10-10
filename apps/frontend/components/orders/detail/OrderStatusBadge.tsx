'use client';

import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { cn } from '@/lib/utils';
import { STATUS_BADGE, STATUS_BAR } from '@/components/orders/list/constants';

/** Badge de statut du détail : pastille + libellé, mêmes couleurs que la liste. */
export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const label = useOrderStatusLabel();
  return (
    <span className={cn('inline-flex h-7 shrink-0 items-center gap-1.75 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold', STATUS_BADGE[status], className)}>
      <span className={cn('size-2 rounded-full', STATUS_BAR[status])} aria-hidden />
      {label(status)}
    </span>
  );
}
