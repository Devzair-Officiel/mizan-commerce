'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import { billingErrorCode, useCancelSubscription, useRefreshSubscription } from '@/lib/hooks/useBilling';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useDowngradeToFree, type Subscription } from '@/lib/hooks/useSubscription';

/**
 * Résiliation, discrète en bas de page, après confirmation. Abonnement Stripe : fin de la période
 * payée (immédiate en retard de paiement) ; essai ou boutique sans Stripe : retour immédiat sur
 * Découverte. Masquée pour un membre non propriétaire et quand la résiliation est déjà programmée.
 */
export function CancelPlan({ subscription }: { subscription: Subscription }) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const downgrade = useDowngradeToFree();
  const cancel = useCancelSubscription();
  const { mutate: resync } = useRefreshSubscription();
  const [open, setOpen] = useState(false);
  const stripe = subscription.stripe_managed;
  const pastDue = subscription.status === 'past_due';

  if (!subscription.can_manage || (stripe && subscription.cancel_at_period_end && !pastDue)) return null;

  async function confirm() {
    if (!stripe) {
      try {
        await downgrade.mutateAsync();
      } catch {
        throw new Error(t('cancel_error'));
      }
      return;
    }
    try {
      await cancel.mutateAsync();
    } catch (err) {
      // Déjà résilié (autre onglet, webhook) : on relit l'état, sans message d'erreur.
      if (billingErrorCode(err) !== 'nothing_to_cancel') throw new Error(t('errors.cancel_failed'));
      resync();
    }
  }

  const end = subscription.current_period_end
    ? formatDate(subscription.current_period_end, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <section className="flex flex-col items-start gap-1 border-t border-border pt-4" data-cancel-plan={stripe ? 'stripe' : 'local'}>
      <button type="button" onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]">
        {t(stripe ? 'cancel_cta_stripe' : 'cancel_cta')}
      </button>
      <p className="text-xs text-muted-foreground">{stripe ? t('cancel_hint_stripe', { mode: pastDue ? 'past_due' : 'period_end' }) : t('cancel_hint')}</p>
      <ConfirmDialog open={open} onOpenChange={setOpen} variant="destructive" onConfirm={confirm}
        title={t(stripe ? 'cancel_title_stripe' : 'cancel_title')}
        description={stripe ? t('cancel_text_stripe', { mode: pastDue ? 'past_due' : 'period_end', date: end }) : t('cancel_text')}
        confirmLabel={t('cancel_confirm')} cancelLabel={t('cancel_back')} />
    </section>
  );
}
