'use client';

import { OrdersTable } from './OrdersTable';
import { OrdersTableSkeleton } from './OrdersTableSkeleton';
import { OrdersPagination } from './OrdersPagination';
import type { OrderSummary } from '@/lib/hooks/useOrders';

interface Props {
  orders: OrderSummary[];
  isLoading: boolean;
  total: number;
  urlPage: number;
  pageSize: number;
  currency: string;
  onPrev: () => void;
  onNext: () => void;
}

export function OrdersDesktopView({
  orders, isLoading, total, urlPage, pageSize, currency, onPrev, onNext,
}: Props) {
  if (isLoading) return <OrdersTableSkeleton />;
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <OrdersTable orders={orders} currency={currency} />
      <OrdersPagination
        total={total}
        page={urlPage}
        pageSize={pageSize}
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  );
}
