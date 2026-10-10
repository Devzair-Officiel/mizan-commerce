'use client';

import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Check, Receipt, RotateCcw } from 'lucide-react';
import type { Order } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { getNextStatus, remainingDue } from './constants';
import type { OrderDetailActions } from './useOrderDetailState';

export type OrderActionKey =
  | 'advance' | 'collect' | 'reactivate' | 'issue_invoice'
  | 'revert' | 'download_invoice' | 'whatsapp' | 'cancel';

/** Une action de la page : bouton principal, entrée du menu « ⋯ » ou de la feuille mobile. */
export interface OrderAction {
  key: OrderActionKey;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  onSelect?: () => void;
  /** Lien à ouvrir dans un nouvel onglet (PDF de la facture) au lieu d'un geste. */
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
}

type NextStepT = ReturnType<typeof useTranslations<'orders.nextStep'>>;

function advanceLabel(t: NextStepT, next: string, kind: string, fm: string | null): string {
  if (next !== 'shipped') return t('action_to_prepare');
  if (kind === 'services') return t('action_shipped_services');
  return fm === 'delivery' ? t('action_shipped_delivery') : t('action_shipped_on_site');
}

/**
 * Action principale, qui suit l'état de la commande :
 * étape suivante du parcours → encaisser le reste → réactiver → émettre la facture → rien.
 */
export function useOrderPrimaryAction(order: Order, actions: OrderDetailActions): OrderAction | null {
  const t = useTranslations('orders.detail');
  const tStep = useTranslations('orders.nextStep');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const fm = shop?.fulfillment_mode ?? null;
  const next = getNextStatus(order.status, fm);
  const due = remainingDue(order);

  if (next) {
    return {
      key: 'advance', icon: Check, disabled: actions.pending,
      label: advanceLabel(tStep, next, shop?.catalog_kind ?? 'both', fm),
      onSelect: () => actions.transition(next),
    };
  }
  if (order.status === 'shipped' && due > 0) {
    return {
      key: 'collect', icon: Banknote,
      label: t('collect', { amount: formatMoney(due, shop?.currency ?? 'EUR') }),
      onSelect: () => actions.openPayment(due),
    };
  }
  if (order.status === 'cancelled') {
    return { key: 'reactivate', icon: RotateCcw, label: t('reactivate'), disabled: actions.pending, onSelect: () => actions.confirm('reactivate') };
  }
  if (order.status === 'shipped' && !order.invoice && order.items.length > 0) {
    return { key: 'issue_invoice', icon: Receipt, label: t('issue_invoice'), onSelect: actions.openInvoice };
  }
  return null;
}
