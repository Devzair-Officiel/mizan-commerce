import { AlertCircle, Clock } from 'lucide-react';
import type { OrderSummary } from '@/lib/hooks/useOrders';

export interface AlertInfo {
  icon: React.ReactNode;
  colorClass: string;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getAlert(order: OrderSummary): AlertInfo | null {
  const ageDays = (Date.now() - new Date(order.created_at).getTime()) / DAY_MS;

  if (order.status === 'shipped' && order.payment_status !== 'paid') {
    return {
      icon: <AlertCircle size={13} />,
      colorClass: 'text-red-500 dark:text-red-400',
      label: 'Expédiée non payée',
    };
  }
  if (order.status === 'prepared' && ageDays >= 3) {
    return {
      icon: <Clock size={13} />,
      colorClass: 'text-amber-600 dark:text-amber-400',
      label: 'À expédier',
    };
  }
  if (order.status === 'draft' && ageDays >= 7) {
    return {
      icon: <Clock size={13} />,
      colorClass: 'text-muted-foreground',
      label: 'Brouillon ancien',
    };
  }
  return null;
}
