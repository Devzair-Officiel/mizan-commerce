'use client';

import type { ReactNode } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { PreparedMessageHistory } from '@/components/messages/PreparedMessageHistory';
import type { Order } from '@/lib/hooks/useOrders';
import { OrderActionsMenu } from './OrderActionsMenu';
import { OrderActivityTimeline } from './OrderActivityTimeline';
import { OrderCustomerCard } from './OrderCustomerCard';
import { OrderDetailDialogs } from './OrderDetailDialogs';
import { OrderDetailHeader } from './OrderDetailHeader';
import { OrderInvoiceCard } from './OrderInvoiceCard';
import { OrderItemsCard } from './OrderItemsCard';
import { OrderNotesCard } from './OrderNotesCard';
import { OrderPaymentCard } from './OrderPaymentCard';
import { OrderPrimaryButton } from './OrderPrimaryButton';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderStatusStepper } from './OrderStatusStepper';
import type { OrderDetailState } from './useOrderDetailState';
import { useOrderMenuActions } from './useOrderMenuActions';
import { useOrderPrimaryAction } from './useOrderPrimaryAction';

/** Emplacement d'une carte : position dans la pile mobile, masqué si la carte ne rend rien. */
function Slot({ order, children }: { order: string; children: ReactNode }) {
  return <div className={`${order} empty:hidden`}>{children}</div>;
}

const COLUMN = 'contents lg:flex lg:flex-col lg:gap-5';

/**
 * Détail d'une commande. Desktop : objet à gauche (suivi, articles, notes, historique),
 * personnes et argent à droite (client, paiement, facture, messages). Mobile : une seule
 * pile réordonnée, action principale flottante.
 */
export function OrderDetailView({ order, state }: { order: Order; state: OrderDetailState }) {
  const { actions } = state;
  const primary = useOrderPrimaryAction(order, actions);
  const menu = useOrderMenuActions(order, actions, primary?.key);

  return (
    <>
      <div className="contents lg:hidden">
        <TopBar back hideSearch title={order.order_number} action={<OrderActionsMenu actions={menu} variant="sheet" />} />
      </div>
      <OrderDetailHeader order={order} primary={primary} menu={menu} />
      <div className={`flex flex-col gap-4 p-4 lg:pt-5 ${primary ? 'pb-28' : ''} lg:pb-8`}>
        <OrderStatusBadge status={order.status} className="self-start lg:hidden" />
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
          <div className={COLUMN}>
            <Slot order="max-lg:order-1"><OrderStatusStepper order={order} actions={actions} /></Slot>
            <Slot order="max-lg:order-3"><OrderItemsCard order={order} /></Slot>
            <Slot order="max-lg:order-6"><OrderNotesCard orderId={order.id} /></Slot>
            <Slot order="max-lg:order-7"><OrderActivityTimeline orderId={order.id} /></Slot>
          </div>
          <div className={`${COLUMN} lg:sticky lg:top-6`}>
            <Slot order="max-lg:order-2"><OrderCustomerCard order={order} actions={actions} /></Slot>
            <Slot order="max-lg:order-4">
              <OrderPaymentCard order={order} actions={actions} collectIsPrimary={primary?.key === 'collect'} />
            </Slot>
            <Slot order="max-lg:order-5">
              <OrderInvoiceCard order={order} onIssue={actions.openInvoice} issueIsPrimary={primary?.key === 'issue_invoice'} />
            </Slot>
            <Slot order="max-lg:order-8"><PreparedMessageHistory orderId={order.id} compact /></Slot>
          </div>
        </div>
      </div>
      {primary && (
        <FloatingActionBar variant="button">
          <OrderPrimaryButton action={primary} className="h-12 w-full shadow-lg" />
        </FloatingActionBar>
      )}
      <OrderDetailDialogs order={order} state={state} />
    </>
  );
}
