import { AlertCircle, Clock } from 'lucide-react';
import type { OrderSummary } from '@/lib/hooks/useOrders';

export type AlertKey = 'shipped_unpaid' | 'to_ship' | 'old_draft';

export interface AlertInfo {
  icon: React.ReactNode;
  colorClass: string;
  key: AlertKey;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getAlert(order: OrderSummary): AlertInfo | null {
  const ageDays = (Date.now() - new Date(order.created_at).getTime()) / DAY_MS;

  if (order.status === 'shipped' && order.payment_status !== 'paid') {
    return {
      icon: <AlertCircle size={13} />,
      colorClass: 'text-red-500 dark:text-red-400',
      key: 'shipped_unpaid',
    };
  }
  if (order.status === 'prepared' && ageDays >= 3) {
    return {
      icon: <Clock size={13} />,
      colorClass: 'text-amber-600 dark:text-amber-400',
      key: 'to_ship',
    };
  }
  if (order.status === 'draft' && ageDays >= 7) {
    return {
      icon: <Clock size={13} />,
      colorClass: 'text-muted-foreground',
      key: 'old_draft',
    };
  }
  return null;
}
