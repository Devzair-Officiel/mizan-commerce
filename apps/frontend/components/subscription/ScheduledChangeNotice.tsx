'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BillingNotice } from '@/components/subscription/BillingNotice';
import {
  planChangeErrorKey, PLAN_CHANGE_RESYNC, useCancelScheduledChange, useInvalidateSubscription, type PlanChangeErrorKey,
} from '@/lib/hooks/useBilling';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { usePlanLabel } from '@/lib/hooks/usePlanLabel';
import type { ScheduledChange, Subscription } from '@/lib/hooks/useSubscription';
import { notify } from '@/lib/notify';

interface ScheduledChangeNoticeProps {
  subscription: Subscription;
  change: ScheduledChange;
}

/**
 * « Passage à … le … » : changement de formule programmé en fin de période, annulable d'un geste
 * par le propriétaire (sans confirmation : la formule actuelle se renouvelle, rien n'est débité).
 */
export function ScheduledChangeNotice({ subscription, change }: ScheduledChangeNoticeProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const label = usePlanLabel();
  const cancel = useCancelScheduledChange();
  const resync = useInvalidateSubscription();
  const [error, setError] = useState<PlanChangeErrorKey | null>(null);
  const at = change.at ?? subscription.current_period_end;

  async function undo() {
    setError(null);
    try {
      await cancel.mutateAsync();
      notify.success(t('change.cancelled'));
    } catch (err) {
      const key = planChangeErrorKey(err, 'cancel_change_failed');
      // Plus rien de programmé (annulé ailleurs, déjà appliqué) : l'état affiché est périmé.
      if (PLAN_CHANGE_RESYNC.has(key)) void resync();
      else setError(key);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-scheduled-change={change.plan}>
      <BillingNotice kind="change_scheduled"
        text={t('change.scheduled_notice', {
          target: label(change.plan, change.interval),
          dated: at ? 'yes' : 'no',
          date: at ? formatDate(at, { day: 'numeric', month: 'long', year: 'numeric' }) : '',
          current: label(subscription.effective_plan_code, subscription.billing_interval),
        })}
        action={subscription.can_manage ? { label: t('change.cancel_cta'), onClick: undo, pending: cancel.isPending, variant: 'outline' } : undefined} />
      {error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{t(`change.errors.${error}`)}</p>}
    </div>
  );
}
