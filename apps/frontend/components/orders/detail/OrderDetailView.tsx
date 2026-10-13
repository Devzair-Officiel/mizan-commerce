'use client';

import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { TopBar } from '@/components/layout/TopBar';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { PreparedMessageHistory } from '@/components/messages/PreparedMessageHistory';
import type { Order } from '@/lib/hooks/useOrders';
import { OrderActivityTimeline } from './OrderActivityTimeline';
import { OrderCustomerCard } from './OrderCustomerCard';
import { OrderDetailDialogs } from './OrderDetailDialogs';
import { OrderDetailHeader } from './OrderDetailHeader';
import { OrderInvoiceCard } from './OrderInvoiceCard';
import { OrderItemsCard } from './OrderItemsCard';
import { OrderNotesCard } from './OrderNotesCard';
import { OrderPaymentCard } from './OrderPaymentCard';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderStatusStepper } from './OrderStatusStepper';
import type { OrderDetailState } from './useOrderDetailState';
import { useOrderMenuActions } from './useOrderMenuActions';
import { useOrderPrimaryAction } from './useOrderPrimaryAction';

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
        <TopBar back hideSearch title={order.order_number} action={<DetailActionsMenu actions={menu} variant="sheet" />} />
      </div>
      <OrderDetailHeader order={order} primary={primary} menu={menu} />
      <div className={`flex flex-col gap-4 p-4 lg:pt-5 ${primary ? 'pb-28' : ''} lg:pb-8`}>
        <OrderStatusBadge status={order.status} className="self-start lg:hidden" />
        <div className={DETAIL_GRID}>
          <div className={DETAIL_COLUMN}>
            <DetailSlot order="max-lg:order-1"><OrderStatusStepper order={order} actions={actions} /></DetailSlot>
            <DetailSlot order="max-lg:order-3"><OrderItemsCard order={order} /></DetailSlot>
            <DetailSlot order="max-lg:order-6"><OrderNotesCard orderId={order.id} /></DetailSlot>
            <DetailSlot order="max-lg:order-7"><OrderActivityTimeline orderId={order.id} /></DetailSlot>
          </div>
          <div className={`${DETAIL_COLUMN} lg:sticky lg:top-6`}>
            <DetailSlot order="max-lg:order-2"><OrderCustomerCard order={order} actions={actions} /></DetailSlot>
            <DetailSlot order="max-lg:order-4">
              <OrderPaymentCard order={order} actions={actions} collectIsPrimary={primary?.key === 'collect'} />
            </DetailSlot>
            <DetailSlot order="max-lg:order-5">
              <OrderInvoiceCard order={order} onIssue={actions.openInvoice} issueIsPrimary={primary?.key === 'issue_invoice'} />
            </DetailSlot>
            <DetailSlot order="max-lg:order-8"><PreparedMessageHistory orderId={order.id} /></DetailSlot>
          </div>
        </div>
      </div>
      {primary && (
        <FloatingActionBar variant="button">
          <DetailPrimaryButton action={primary} className="h-12 w-full shadow-lg" />
        </FloatingActionBar>
      )}
      <OrderDetailDialogs order={order} state={state} />
    </>
  );
}
