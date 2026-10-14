'use client';

import { useState } from 'react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { TopBar } from '@/components/layout/TopBar';
import { PreparedMessageHistory } from '@/components/messages/PreparedMessageHistory';
import { RemindersCard } from '@/components/reminders/RemindersCard';
import type { ActivityType, Customer } from '@/lib/hooks/useCustomers';
import { useCan } from '@/lib/hooks/useMe';
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

/**
 * Fiche client. Desktop : historique à gauche (commandes, rappels, activité, notes), contact et argent
 * à droite (coordonnées, situation, messages). Mobile : une seule pile réordonnée, action
 * principale flottante.
 */
export function CustomerDetailView({ customer }: { customer: Customer }) {
  const state = useCustomerDetailState(customer);
  const { primary, menu } = useCustomerActions(customer, state.actions);
  const [activityFilter, setActivityFilter] = useState<ActivityType | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const canReminders = useCan('reminders');
  const canMessages = useCan('messages');

  return (
    <>
      <div className="contents lg:hidden">
        <TopBar back hideSearch title={customer.display_name} action={<DetailActionsMenu actions={menu} variant="sheet" />} />
      </div>
      <CustomerDetailHeader customer={customer} primary={primary} menu={menu} />
      <div className={`flex flex-col gap-4 p-4 lg:pt-5 ${primary ? 'pb-28' : ''} lg:pb-8`}>
        <CustomerStatusBadges customer={customer} className="lg:hidden" />
        <div className={DETAIL_GRID}>
          <div className={DETAIL_COLUMN}>
            <DetailSlot order="max-lg:order-3"><CustomerOrdersCard customer={customer} /></DetailSlot>
            <DetailSlot order="max-lg:order-4">{canReminders && <RemindersCard link="customer" id={customer.id} />}</DetailSlot>
            <DetailSlot order="max-lg:order-5">
              <CustomerActivityTimeline customerId={customer.id} customerName={customer.display_name} activityFilter={activityFilter} pendingOnly={pendingOnly}
                onFilterChange={setActivityFilter} onTogglePending={hasPending(customer) ? () => setPendingOnly((v) => !v) : undefined} />
            </DetailSlot>
            <DetailSlot order="max-lg:order-6"><CustomerNotesCard customer={customer} notes={state.notes} /></DetailSlot>
          </div>
          <div className={`${DETAIL_COLUMN} lg:sticky lg:top-6`}>
            <DetailSlot order="max-lg:order-2"><CustomerContactCard customer={customer} actions={state.actions} /></DetailSlot>
            <DetailSlot order="max-lg:order-1"><CustomerSituationCard customer={customer} /></DetailSlot>
            <DetailSlot order="max-lg:order-7">{canMessages && <PreparedMessageHistory customerId={customer.id} />}</DetailSlot>
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
