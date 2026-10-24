'use client';

import { useTranslations } from 'next-intl';
import { PlanChangeLosses } from '@/components/subscription/PlanChangeLosses';
import type { PlanChangePreview } from '@/lib/hooks/useBilling';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { usePlanLabel } from '@/lib/hooks/usePlanLabel';
import type { Subscription } from '@/lib/hooks/useSubscription';

interface PlanChangeSummaryProps {
  preview: PlanChangePreview;
  subscription: Subscription;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/**
 * Aperçu du serveur, affiché tel quel (aucun calcul ici) : montée payée aujourd'hui au prorata,
 * ou changement programmé sans paiement ; changement déjà programmé qu'il remplace ; pertes.
 * Une ligne dont la valeur manque (date inconnue) ne s'affiche pas.
 */
export function PlanChangeSummary({ preview, subscription }: PlanChangeSummaryProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  const label = usePlanLabel();
  const immediate = preview.kind === 'immediate';
  const renewal = preview.next_renewal;
  const previous = subscription.scheduled_change;

  return (
    <div className="flex flex-col gap-4" data-plan-change-kind={preview.kind}>
      <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4">
        <p className="text-sm font-semibold text-foreground" data-plan-change-target>{label(preview.target.plan, preview.target.interval)}</p>
        {immediate ? (
          <>
            <p className="text-sm text-muted-foreground">{t('change.due_today')}</p>
            <p className="text-3xl font-bold tabular-nums text-foreground" data-due-now={preview.amount_due_now}>
              {formatMoney(preview.amount_due_now, preview.currency)}
            </p>
            <p className="text-sm font-medium text-foreground">{t('change.effective_now')}</p>
          </>
        ) : (
          <p className="text-xl font-bold text-foreground" data-due-now={preview.amount_due_now}>{t('change.no_payment_today')}</p>
        )}
      </div>
      {!immediate && preview.effective_at && (
        <p className="text-sm text-foreground" data-effective-at>
          {t('change.takes_effect', { date: formatDate(preview.effective_at, LONG_DATE), plan: label(subscription.effective_plan_code, subscription.billing_interval) })}
        </p>
      )}
      {renewal.date && (
        <p className="text-sm tabular-nums text-foreground" data-next-renewal={renewal.amount}>
          {t('change.next_renewal', { amount: formatMoney(renewal.amount, preview.currency), date: formatDate(renewal.date, LONG_DATE) })}
        </p>
      )}
      {immediate && <p className="text-sm text-muted-foreground">{t('change.prorata')}</p>}
      {previous && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-400" data-overwrites={previous.plan}>
          {t('change.overwrites', { kind: preview.kind, plan: label(previous.plan, previous.interval) })}
        </p>
      )}
      <PlanChangeLosses preview={preview} />
    </div>
  );
}
