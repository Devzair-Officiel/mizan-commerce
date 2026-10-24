'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Hourglass, X } from 'lucide-react';
import { useFormatDate } from '@/lib/hooks/useFormat';
import type { Subscription } from '@/lib/hooks/useSubscription';

/** L'essai s'annonce sur toutes les pages dans ses dernières 24 heures. */
const TRIAL_END_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Masqué pour la session, par fin d'essai : une fin repoussée le fait revenir. */
const storageKey = (end: string) => `mizan.trial-end-banner.${end}`;

function isDismissed(end: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(end)) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(end: string): void {
  try {
    sessionStorage.setItem(storageKey(end), '1');
  } catch {
    // Stockage indisponible (navigation privée, données bloquées) : masqué jusqu'au rechargement.
  }
}

/** Essai Mizan (sans Stripe) à moins de 24 heures de sa fin, et pas encore terminé. */
function endingTrial(subscription: Subscription): string | null {
  const end = subscription.trial_ends_at;
  if (subscription.status !== 'trialing' || subscription.stripe_managed || subscription.is_trial_expired || !end) return null;
  const left = Date.parse(end) - Date.now();
  return left > 0 && left <= TRIAL_END_THRESHOLD_MS ? end : null;
}

/** Bandeau global de fin d'essai : date et heure, « Choisir une formule », masquable pour la session. */
export function TrialEndBanner({ subscription }: { subscription: Subscription }) {
  const t = useTranslations('layout.billing');
  const formatDate = useFormatDate();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const end = endingTrial(subscription);
  if (!end || dismissed === end || isDismissed(end)) return null;

  function dismiss(at: string) {
    rememberDismissed(at);
    setDismissed(at);
  }

  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-700 dark:text-amber-400 lg:px-8" data-billing-banner="trial_end">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-56 items-start gap-2.5 py-2">
          <Hourglass size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm font-medium tabular-nums">
            {t('trial_end', {
              date: formatDate(end, { weekday: 'long', day: 'numeric', month: 'long' }),
              time: formatDate(end, { hour: '2-digit', minute: '2-digit' }),
            })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/settings/subscription"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold underline underline-offset-2 active:scale-[0.98]">
            {t('trial_end_cta')}
          </Link>
          <button type="button" onClick={() => dismiss(end)} aria-label={t('dismiss')} data-banner-dismiss
            className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-amber-500/10 active:scale-[0.98]">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
