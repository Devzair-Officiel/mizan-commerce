'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanChangeErrorKey, PlanChangePreview } from '@/lib/hooks/useBilling';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { usePortalRedirect } from '@/lib/hooks/usePortalRedirect';

/** Refus sans suite possible dans la fenêtre : seul « Retour » reste. */
const BLOCKING: ReadonlySet<PlanChangeErrorKey> = new Set([
  'payment_overdue', 'cancellation_scheduled', 'no_change', 'use_checkout', 'nothing_scheduled',
  'unavailable', 'owner_only', 'change_not_supported',
]);

interface PlanChangeActionsProps {
  /** Aperçu affiché, `null` pendant son chargement ou après son refus. */
  preview: PlanChangePreview | null;
  error: PlanChangeErrorKey | null;
  pending: boolean;
  onConfirm: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const BUTTON = 'h-11 rounded-full px-5 active:scale-[0.98]';

/**
 * Confirmer l'aperçu (« Confirmer et payer … » ou « Programmer le changement ») ; paiement refusé :
 * moyen de paiement à mettre à jour (portail Stripe) puis « Réessayer », qui demande un nouvel aperçu.
 */
export function PlanChangeActions({ preview, error, pending, onConfirm, onRetry, onClose }: PlanChangeActionsProps) {
  const t = useTranslations('settings.subscription');
  const formatMoney = useFormatMoney();
  const portal = usePortalRedirect();
  const paymentFailed = error === 'payment_failed';
  const canConfirm = preview !== null && !paymentFailed && !(error && BLOCKING.has(error));
  const canRetry = paymentFailed || (preview === null && error === 'change_failed');

  return (
    <div className="flex flex-col gap-3">
      {portal.error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{t(`errors.${portal.error}`)}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending} className={BUTTON}>{t('checkout_back')}</Button>
        {canRetry && (
          <Button type="button" variant="outline" onClick={onRetry} className={BUTTON} data-plan-change-retry>{t('retry')}</Button>
        )}
        {paymentFailed && (
          <Button type="button" onClick={portal.open} disabled={portal.busy} aria-busy={portal.busy} className={BUTTON} data-plan-change-portal>
            {portal.busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {t('past_due_cta')}
          </Button>
        )}
        {canConfirm && (
          <Button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending} className={BUTTON} data-plan-change-confirm>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {preview.kind === 'immediate'
              ? t('change.confirm_pay', { amount: formatMoney(preview.amount_due_now, preview.currency) })
              : t('change.confirm_schedule')}
          </Button>
        )}
      </div>
    </div>
  );
}
