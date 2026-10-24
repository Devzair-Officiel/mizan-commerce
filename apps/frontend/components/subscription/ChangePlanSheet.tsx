'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api-client';
import { PlanChangeActions } from '@/components/subscription/PlanChangeActions';
import { PlanChangeSummary } from '@/components/subscription/PlanChangeSummary';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  amountChangedPreview, billingErrorCode, planChangeErrorKey, PLAN_CHANGE_RESYNC, useApplyPlanChange,
  useInvalidateSubscription, usePlanChangePreview, useReplacePlanChangePreview,
  type PlanChangeErrorKey, type PlanChangePreview, type PlanChoice,
} from '@/lib/hooks/useBilling';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { usePlanLabel } from '@/lib/hooks/usePlanLabel';
import type { Subscription } from '@/lib/hooks/useSubscription';
import { notify } from '@/lib/notify';

/** Aperçu remplacé après un 409 : montant différent, ou même montant recalculé (aperçu expiré). */
type PreviewNotice = 'amount_changed' | 'preview_expired';

/** Refus d'une confirmation mal formée : message générique, puis un nouvel aperçu. */
function needsNewPreview(error: unknown): boolean {
  const code = billingErrorCode(error);
  return code === 'confirmation_required' || code === 'amount_changed' || (error instanceof ApiError && error.status === 400 && code === null);
}

/** Confirmation de l'aperçu affiché ; 409 : nouvel aperçu affiché, jamais reconfirmé tout seul. */
function usePlanChangeFlow(choice: PlanChoice, onDone: (preview: PlanChangePreview, subscription: Subscription) => void) {
  const preview = usePlanChangePreview(choice);
  const apply = useApplyPlanChange();
  const replace = useReplacePlanChangePreview();
  const resync = useInvalidateSubscription();
  const [notice, setNotice] = useState<PreviewNotice | null>(null);
  const [error, setError] = useState<PlanChangeErrorKey | null>(null);

  async function confirm() {
    const shown = preview.data;
    if (!shown) return;
    setError(null);
    setNotice(null);
    try {
      onDone(shown, await apply.mutateAsync(shown));
    } catch (err) {
      const next = amountChangedPreview(err);
      if (next) {
        replace(next);
        setNotice(next.amount_due_now === shown.amount_due_now ? 'preview_expired' : 'amount_changed');
        return;
      }
      const key = needsNewPreview(err) ? 'change_failed' : planChangeErrorKey(err);
      if (needsNewPreview(err)) void preview.refetch();
      if (PLAN_CHANGE_RESYNC.has(key)) void resync();
      setError(key);
    }
  }

  function retry() {
    setError(null);
    setNotice(null);
    void preview.refetch();
  }

  return { preview, confirm, retry, pending: apply.isPending, notice, error };
}

interface ChangePlanSheetProps {
  choice: PlanChoice;
  subscription: Subscription;
  onClose: () => void;
}

/**
 * Changement de formule d'un abonné Stripe : un aperçu chiffré à l'ouverture (rien n'est débité),
 * puis la confirmation de ce même aperçu. Fermeture impossible pendant le paiement.
 */
export function ChangePlanSheet({ choice, subscription, onClose }: ChangePlanSheetProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const label = usePlanLabel();
  const flow = usePlanChangeFlow(choice, (preview, next) => {
    const at = next.scheduled_change?.at ?? preview.effective_at;
    notify.success(preview.kind === 'immediate'
      ? t('change.done_now', { plan: label(preview.target.plan, preview.target.interval) })
      : t('change.done_scheduled', { dated: at ? 'yes' : 'no', date: at ? formatDate(at, { day: 'numeric', month: 'long', year: 'numeric' }) : '' }));
    onClose();
  });
  const { preview } = flow;
  const previewError = preview.isError && !preview.isFetching ? planChangeErrorKey(preview.error) : null;

  return (
    <BottomSheet open onClose={flow.pending ? () => {} : onClose} title={t('change.title')}>
      <div className="flex flex-col gap-4" data-plan-change-sheet>
        {flow.notice && (
          <p role="status" className="text-sm font-medium text-amber-700 dark:text-amber-400" data-plan-change-notice={flow.notice}>{t(`change.${flow.notice}`)}</p>
        )}
        {preview.isFetching && (
          <div className="flex flex-col gap-3" data-plan-change-loading aria-busy>
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {previewError && (
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400" data-plan-change-error={previewError}>{t(`change.errors.${previewError}`)}</p>
        )}
        {!preview.isFetching && preview.data && !previewError && <PlanChangeSummary preview={preview.data} subscription={subscription} />}
        {flow.error && (
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400" data-plan-change-error={flow.error}>{t(`change.errors.${flow.error}`)}</p>
        )}
        <PlanChangeActions preview={preview.isFetching || previewError ? null : preview.data ?? null} error={flow.error ?? previewError}
          pending={flow.pending} onConfirm={flow.confirm} onRetry={flow.retry} onClose={onClose} />
      </div>
    </BottomSheet>
  );
}
