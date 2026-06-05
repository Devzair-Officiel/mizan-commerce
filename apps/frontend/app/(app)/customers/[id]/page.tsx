'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import {
  useCustomer, useDeactivateCustomer, useReactivateCustomer,
  type ActivityType,
} from '@/lib/hooks/useCustomers';
import { useCreateReminder } from '@/lib/hooks/useReminders';
import { CustomerActionsSheet } from '@/components/customers/detail/CustomerActionsSheet';
import { CustomerActivityTimeline } from '@/components/customers/detail/CustomerActivityTimeline';
import { CustomerAddressSheet } from '@/components/customers/detail/CustomerAddressSheet';
import { CustomerFlashNotification } from '@/components/customers/detail/CustomerFlashNotification';
import { CustomerHeroCard } from '@/components/customers/detail/CustomerHeroCard';
import { CustomerNotesSheet } from '@/components/customers/detail/CustomerNotesSheet';
import { CustomerStatsGrid } from '@/components/customers/detail/CustomerStatsGrid';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(id);
  const createReminder = useCreateReminder();
  const deactivate = useDeactivateCustomer();
  const reactivate = useReactivateCustomer();

  const todayKey = `relance_${id}_${new Date().toISOString().slice(0, 10)}`;
  const [relanceCreated, setRelanceCreated] = useState(() => {
    try { return localStorage.getItem(todayKey) === '1'; } catch { return false; }
  });
  const [flashVisible, setFlashVisible] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityType | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const customerBadge = useMemo<{ label: string; classes: string } | null>(() => {
    if (!customer) return null;
    if (parseFloat(customer.pending_amount) > 0) {
      return {
        label: 'À relancer',
        classes: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-400/20',
      };
    }
    const daysSinceCreated = (nowMs - new Date(customer.created_at).getTime()) / 86_400_000;
    if (daysSinceCreated < 30 && customer.order_count === 0) {
      return {
        label: 'Nouveau client',
        classes: 'bg-primary/10 text-primary border border-primary/20',
      };
    }
    if (customer.order_count >= 3) {
      return {
        label: 'Client régulier',
        classes: 'bg-muted text-muted-foreground border border-border',
      };
    }
    return null;
  }, [customer, nowMs]);

  async function handleDeactivate() {
    if (!confirm('Désactiver ce client ? Il n\'apparaîtra plus dans la liste.')) return;
    await deactivate.mutateAsync(id);
    router.push('/customers');
  }

  async function handleMarquerRelancer() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await createReminder.mutateAsync({
      title: `Relancer ${customer?.name ?? 'le client'}`,
      due_at: tomorrow.toISOString(),
      category: 'customer_followup',
      customer: id,
    });
    setRelanceCreated(true);
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 3000);
    try { localStorage.setItem(todayKey, '1'); } catch { /* ignore */ }
  }

  if (isLoading) return <><TopBar title="Client" /><p className="p-4 text-sm text-muted-foreground">Chargement…</p></>;
  if (!customer) return <><TopBar title="Client" /><p className="p-4 text-sm text-red-500">Client introuvable.</p></>;

  return (
    <>
      <TopBar title={customer.name} />

      <CustomerFlashNotification
        visible={flashVisible}
        customerName={customer.name}
        onDismiss={() => setFlashVisible(false)}
      />

      <CustomerActionsSheet
        open={showMore}
        onClose={() => setShowMore(false)}
        customer={customer}
        relanceCreated={relanceCreated}
        createReminderPending={createReminder.isPending}
        deactivatePending={deactivate.isPending}
        reactivatePending={reactivate.isPending}
        onShowNotes={() => setShowNotes(true)}
        onShowAddress={() => setShowAddress(true)}
        onSchedule={handleMarquerRelancer}
        onEdit={() => router.push(`/customers/${id}/edit`)}
        onDeactivate={handleDeactivate}
        onReactivate={async () => { await reactivate.mutateAsync(id); }}
      />

      <div className="flex flex-col gap-5 p-4">
        <CustomerHeroCard
          customer={customer}
          badge={customerBadge}
          onOpenMore={() => setShowMore(true)}
        />

        <CustomerNotesSheet
          open={showNotes}
          onClose={() => setShowNotes(false)}
          notes={customer.notes}
        />

        <CustomerAddressSheet
          open={showAddress}
          onClose={() => setShowAddress(false)}
          customer={customer}
        />

        <CustomerStatsGrid
          customer={customer}
          pendingOnly={pendingOnly}
          onTogglePendingFilter={() => setPendingOnly((v) => !v)}
        />

        <CustomerActivityTimeline
          customerId={id}
          activityFilter={activityFilter}
          pendingOnly={pendingOnly}
          onFilterChange={setActivityFilter}
        />
      </div>
    </>
  );
}
