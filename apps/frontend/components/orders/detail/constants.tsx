import {
  ArrowRight, CreditCard, FileEdit, Flag, ListChecks, PackageCheck,
  StickyNote, Truck, XCircle,
} from 'lucide-react';
import type { OrderActivityEvent } from '@/lib/hooks/useOrders';

export interface StatusConfig { icon: React.ReactNode; badge: string }

export const STATUS_DRAFT: StatusConfig = {
  icon: <FileEdit size={15} />,
  badge: 'bg-zinc-100 text-zinc-600',
};

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft:      STATUS_DRAFT,
  to_prepare: { icon: <ListChecks size={15} />,   badge: 'bg-blue-100 text-blue-700' },
  prepared:   { icon: <PackageCheck size={15} />, badge: 'bg-amber-100 text-amber-700' },
  shipped:    { icon: <Truck size={15} />,        badge: 'bg-green-100 text-green-700' },
  cancelled:  { icon: <XCircle size={15} />,      badge: 'bg-red-100 text-red-500' },
};

export const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500',
  partial: 'text-amber-500',
  paid:    'text-green-600',
};

export const PAYMENT_PILL: Record<string, string> = {
  unpaid:  'bg-red-50 text-red-600 border border-red-100',
  partial: 'bg-amber-50 text-amber-700 border border-amber-100',
  paid:    'bg-green-50 text-green-700 border border-green-100',
};

export type NextStepKey = 'draft' | 'to_prepare' | 'prepared';

export interface NextStep {
  key: NextStepKey;
  next: string;
  icon: React.ReactNode;
  accent: string;
  btnClass: string;
}

export const NEXT_STEP: Record<string, NextStep | null> = {
  draft: {
    key: 'draft',
    next: 'to_prepare',
    icon: <ListChecks size={18} />,
    accent: 'bg-blue-50 text-blue-700 border border-blue-100',
    btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  to_prepare: {
    key: 'to_prepare',
    next: 'prepared',
    icon: <PackageCheck size={18} />,
    accent: 'bg-amber-50 text-amber-700 border border-amber-100',
    btnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  prepared: {
    key: 'prepared',
    next: 'shipped',
    icon: <Truck size={18} />,
    accent: 'bg-green-50 text-green-700 border border-green-100',
    btnClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  shipped: null,
  cancelled: null,
};

export type RevertKey = 'to_prepare' | 'prepared' | 'shipped' | 'cancelled';

export const REVERT_TRANSITION: Record<string, { status: string; key: RevertKey }> = {
  to_prepare: { status: 'draft',      key: 'to_prepare' },
  prepared:   { status: 'to_prepare', key: 'prepared' },
  shipped:    { status: 'prepared',   key: 'shipped' },
  cancelled:  { status: 'draft',      key: 'cancelled' },
};

export const STATUS_ALLOWS_CANCEL = new Set(['draft', 'to_prepare', 'prepared']);

export type ActivityEventDisplay = {
  icon: React.ReactNode;
  iconBg: string;
  titleKey: 'event_created' | 'event_status' | 'event_payment' | 'event_note';
  titleParams?: { from?: string; to?: string };
  body?: string;
};

export function describeEvent(event: OrderActivityEvent): ActivityEventDisplay {
  switch (event.type) {
    case 'created':
      return {
        icon: <Flag size={14} />,
        iconBg: 'bg-zinc-100 text-zinc-600',
        titleKey: 'event_created',
        body: event.data.order_number ? `#${event.data.order_number}` : undefined,
      };
    case 'status_change':
      return {
        icon: <ArrowRight size={14} />,
        iconBg: 'bg-blue-50 text-blue-600',
        titleKey: 'event_status',
        titleParams: { from: event.data.from ?? '', to: event.data.to ?? '' },
      };
    case 'payment_change': {
      const before = event.data.amount_paid_before;
      const after = event.data.amount_paid_after;
      const amountStr = before !== undefined && after !== undefined
        ? `${parseFloat(before ?? '0').toFixed(2)} → ${parseFloat(after ?? '0').toFixed(2)}`
        : undefined;
      return {
        icon: <CreditCard size={14} />,
        iconBg: 'bg-green-50 text-green-600',
        titleKey: 'event_payment',
        titleParams: { from: event.data.from ?? '', to: event.data.to ?? '' },
        body: amountStr,
      };
    }
    case 'note':
      return {
        icon: <StickyNote size={14} />,
        iconBg: 'bg-amber-50 text-amber-600',
        titleKey: 'event_note',
        body: typeof event.data.content === 'string' ? event.data.content : undefined,
      };
  }
}

export function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
