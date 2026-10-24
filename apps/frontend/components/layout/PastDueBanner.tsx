'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { usePortalRedirect } from '@/lib/hooks/usePortalRedirect';
import type { Subscription } from '@/lib/hooks/useSubscription';

interface PastDueBannerProps {
  subscription: Subscription;
  /** Propriétaire : il met à jour son moyen de paiement ; un admin est renvoyé vers lui. */
  owner: boolean;
}

/** Bandeau global du dernier paiement échoué, non masquable tant que le retard dure. */
export function PastDueBanner({ subscription, owner }: PastDueBannerProps) {
  const t = useTranslations('layout.billing');
  const tErrors = useTranslations('settings.subscription.errors');
  const formatDate = useFormatDate();
  const portal = usePortalRedirect();
  const grace = subscription.grace_ends_at;

  return (
    <div role="status" className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-red-700 dark:text-red-400 lg:px-8"
      data-billing-banner="past_due" data-banner-for={owner ? 'owner' : 'admin'}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-2.5 py-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <p className="font-medium">
              {t('past_due', { dated: grace ? 'yes' : 'no', date: grace ? formatDate(grace, { day: 'numeric', month: 'long' }) : '' })}
            </p>
            {!owner && <p>{t('past_due_admin')}</p>}
            {portal.error && <p role="alert">{tErrors(portal.error)}</p>}
          </div>
        </div>
        {owner && (
          <Button type="button" onClick={portal.open} disabled={portal.busy} aria-busy={portal.busy}
            className="h-11 rounded-full px-5 active:scale-[0.98] max-sm:w-full">
            {portal.busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {t('past_due_cta')}
          </Button>
        )}
      </div>
    </div>
  );
}
