'use client';

import { STATUS_BAR } from '@/components/orders/list/constants';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { cn } from '@/lib/utils';

/** Statut compact : pastille + libellé. */
export function OrderStatusDot({ status }: { status: string }) {
  const label = useOrderStatusLabel();
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8125rem]">
      <span className={cn('size-2 shrink-0 rounded-full', STATUS_BAR[status])} aria-hidden />{label(status)}
    </span>
  );
}
