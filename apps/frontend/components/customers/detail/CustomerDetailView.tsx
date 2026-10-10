'use client';

import { useState, type ReactNode } from 'react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { TopBar } from '@/components/layout/TopBar';
import { PreparedMessageHistory } from '@/components/messages/PreparedMessageHistory';
import type { ActivityType, Customer } from '@/lib/hooks/useCustomers';
import { CustomerActivityTimeline } from './CustomerActivityTimeline';
import { CustomerContactCard } from './CustomerContactCard';
import { CustomerDetailDialogs } from './CustomerDetailDialogs';
import { CustomerDetailHeader } from './CustomerDetailHeader';
import { CustomerNotesCard } from './CustomerNotesCard';
import { CustomerOrdersCard } from './CustomerOrdersCard';
import { CustomerSituationCard } from './CustomerSituationCard';
import { CustomerStatusBadges } from './CustomerStatusBadges';
import { hasPending, useCustomerActions } from './useCustomerActions';
import { useCustomerDetailState } from './useCustomerDetailState';

/** Emplacement d'une carte : position dans la pile mobile, masqué si la carte ne rend rien. */
function Slot({ order, children }: { order: string; children: ReactNode }) {
  return <div className={`${order} empty:hidden`}>{children}</div>;
}

const COLUMN = 'contents lg:flex lg:flex-col lg:gap-5';

/**
 * Fiche client. Desktop : historique à gauche (commandes, activité, notes), contact et argent
 * à droite (coordonnées, situation, messages). Mobile : une seule pile réordonnée, action
 * principale flottante.
 */
export function CustomerDetailView({ customer }: { customer: Customer }) {
  const state = useCustomerDetailState(customer);
  const { primary, menu } = useCustomerActions(customer, state.actions);
  const [activityFilter, setActivityFilter] = useState<ActivityType | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);

  return (
    <>
      <div className="contents lg:hidden">
        <TopBar back hideSearch title={customer.name} action={<DetailActionsMenu actions={menu} variant="sheet" />} />
      </div>
      <CustomerDetailHeader customer={customer} primary={primary} menu={menu} />
      <div className={`flex flex-col gap-4 p-4 lg:pt-5 ${primary ? 'pb-28' : ''} lg:pb-8`}>
        <CustomerStatusBadges customer={customer} className="lg:hidden" />
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
          <div className={COLUMN}>
            <Slot order="max-lg:order-3"><CustomerOrdersCard customer={customer} /></Slot>
            <Slot order="max-lg:order-4">
              <CustomerActivityTimeline customerId={customer.id} activityFilter={activityFilter} pendingOnly={pendingOnly}
                onFilterChange={setActivityFilter} onTogglePending={hasPending(customer) ? () => setPendingOnly((v) => !v) : undefined} />
            </Slot>
            <Slot order="max-lg:order-5"><CustomerNotesCard customer={customer} notes={state.notes} /></Slot>
          </div>
          <div className={`${COLUMN} lg:sticky lg:top-6`}>
            <Slot order="max-lg:order-2"><CustomerContactCard customer={customer} actions={state.actions} /></Slot>
            <Slot order="max-lg:order-1"><CustomerSituationCard customer={customer} /></Slot>
            <Slot order="max-lg:order-6"><PreparedMessageHistory customerId={customer.id} compact /></Slot>
          </div>
        </div>
      </div>
      {primary && (
        <FloatingActionBar variant="button">
          <DetailPrimaryButton action={primary} className="h-12 w-full shadow-lg" />
        </FloatingActionBar>
      )}
      <CustomerDetailDialogs customer={customer} state={state} />
    </>
  );
}
