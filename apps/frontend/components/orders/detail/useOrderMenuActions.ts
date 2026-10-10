'use client';

import { useTranslations } from 'next-intl';
import { Download, Receipt, Undo2, XCircle } from 'lucide-react';
import type { Order } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { getRevertStatus, STATUS_ALLOWS_CANCEL, WhatsAppIcon } from './constants';
import type { OrderAction, OrderActionKey } from './useOrderPrimaryAction';
import type { OrderDetailActions } from './useOrderDetailState';

export interface OrderMenuActions {
  /** Actions ordinaires, dans l'ordre d'affichage. */
  items: OrderAction[];
  /** Action dangereuse, après un séparateur. */
  danger: OrderAction | null;
}

/**
 * Déclaration unique des actions secondaires, lue par le menu desktop et la
 * feuille mobile. Chaque action n'apparaît que si elle est possible, et jamais
 * en double de l'action principale.
 */
export function useOrderMenuActions(
  order: Order, actions: OrderDetailActions, primaryKey: OrderActionKey | undefined,
): OrderMenuActions {
  const t = useTranslations('orders.detail');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const items: OrderAction[] = [];

  const revert = order.status === 'cancelled' ? null : getRevertStatus(order.status, shop?.fulfillment_mode ?? null);
  if (revert) {
    items.push({ key: 'revert', icon: Undo2, label: t('revert_to', { label: label(revert) }), disabled: actions.pending, onSelect: () => actions.transition(revert) });
  }
  if (order.invoice) {
    items.push({ key: 'download_invoice', icon: Download, label: t('download_invoice'), href: `/api/proxy/invoices/${order.invoice.id}/pdf/` });
  } else if (order.status !== 'cancelled' && order.items.length > 0 && primaryKey !== 'issue_invoice') {
    items.push({ key: 'issue_invoice', icon: Receipt, label: t('issue_invoice'), onSelect: actions.openInvoice });
  }
  if (order.customer && order.customer_phone) {
    items.push({ key: 'whatsapp', icon: WhatsAppIcon, label: t('send_whatsapp'), onSelect: () => actions.openWhatsApp(templateFor(order)) });
  }
  const danger: OrderAction | null = STATUS_ALLOWS_CANCEL.has(order.status)
    ? { key: 'cancel', icon: XCircle, label: t('cancel_cta'), destructive: true, disabled: actions.pending, onSelect: () => actions.confirm('cancel') }
    : null;
  return { items, danger };
}

/** Modèle du message WhatsApp selon l'état : suivi si remise, relance si un montant est dû. */
export function templateFor(order: Order) {
  if (order.status === 'shipped') return 'tracking' as const;
  if (order.payment_status === 'unpaid' || order.payment_status === 'partial') return 'unpaid_followup' as const;
  return 'order_confirmation' as const;
}
