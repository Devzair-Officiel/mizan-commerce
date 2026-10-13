'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FollowupReminderDialog } from '@/components/reminders/FollowupReminderDialog';
import { ReminderForm } from '@/components/reminders/form/ReminderForm';
import { useSaveReminder } from '@/components/reminders/form/useSaveReminder';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useOrder } from '@/lib/hooks/useOrders';

/** Ouvert depuis une fiche (`?customer=` ou `?order=`) : liens pré-remplis, retour (« Retour ») vers la fiche. */
function NewReminderContent() {
  const t = useTranslations('reminders.new');
  const tNav = useTranslations('layout.nav');
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customer') ?? '';
  const orderId = searchParams.get('order') ?? '';
  // La commande donne son client : attendre qu'elle soit chargée avant de remplir le formulaire.
  const { data: order, isLoading } = useOrder(orderId);
  const back = useBackOr(orderId ? `/orders/${orderId}` : customerId ? `/customers/${customerId}` : '/reminders');
  const { save, isPending, conflict } = useSaveReminder(undefined, back);

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('title')} subtitle={t('subtitle')} back backLabel={orderId || customerId ? undefined : tNav('reminders')} onBack={back} hideSearch />
      {isLoading ? (
        <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <ReminderForm
          mode="create"
          defaultValues={{ customer: order?.customer ?? customerId, order: order?.id ?? '' }}
          onSubmit={save}
          isSubmitting={isPending}
          onLeave={back}
        />
      )}
      <FollowupReminderDialog conflict={conflict} />
    </div>
  );
}

export default function NewReminderPage() {
  return (
    <Suspense>
      <NewReminderContent />
    </Suspense>
  );
}
