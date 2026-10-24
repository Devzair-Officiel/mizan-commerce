'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRefreshSubscription } from '@/lib/hooks/useBilling';
import { subscriptionQuery } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

const PAGE_PATH = '/settings/subscription';
const POLL_MS = 2000;
const POLL_MAX_MS = 30_000;

type Outcome = 'success' | 'cancelled';

function outcomeOf(value: string | null): Outcome | null {
  return value === 'success' || value === 'cancelled' ? value : null;
}

/**
 * Retour de la page de paiement Stripe (`?checkout=success|cancelled`, posé par le serveur).
 * Succès : une resynchronisation, puis une lecture toutes les 2 s pendant 30 s au plus, jusqu'à
 * l'abonnement Stripe actif (le webhook peut arriver après le retour). Le paramètre est retiré
 * de l'adresse dès le message affiché, sans recharger la page.
 */
export function CheckoutReturn() {
  const t = useTranslations('settings.subscription.checkout_return');
  const tPlans = useTranslations('settings.subscription.plans');
  const router = useRouter();
  const params = useSearchParams();
  // Lu une fois : le paramètre est retiré de l'adresse, le message reste.
  const [outcome] = useState(() => outcomeOf(params.get('checkout')));
  const [timedOut, setTimedOut] = useState(false);
  const refresh = useRefreshSubscription();
  const { mutate: resync } = refresh;
  const started = useRef(false);
  const settled = refresh.isSuccess || refresh.isError;
  const { data } = useQuery({
    ...subscriptionQuery,
    refetchInterval: (query) =>
      outcome === 'success' && settled && !timedOut && !query.state.data?.stripe_managed ? POLL_MS : false,
  });

  useEffect(() => {
    if (!outcome || started.current) return;
    started.current = true;
    router.replace(PAGE_PATH, { scroll: false });
    // Resynchronisation de l'état (pas un geste de l'utilisateur), une seule fois par retour.
    if (outcome === 'success') resync();
  }, [outcome, resync, router]);

  useEffect(() => {
    if (outcome !== 'success') return;
    const timer = window.setTimeout(() => setTimedOut(true), POLL_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  if (!outcome) return null;
  const active = outcome === 'success' && data?.stripe_managed;
  const waiting = outcome === 'success' && !active && !timedOut;
  const tone = active ? 'success' : outcome === 'success' && !waiting ? 'pending' : 'neutral';

  return (
    <div role="status" data-checkout-return={active ? 'active' : waiting ? 'confirming' : outcome === 'success' ? 'pending' : 'cancelled'}
      className={cn('flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm', {
        'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400': tone === 'success',
        'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400': tone === 'pending',
        'border-border bg-card text-foreground': tone === 'neutral',
      })}>
      {waiting && <Loader2 size={18} className="shrink-0 animate-spin text-primary" aria-hidden />}
      {active && <CheckCircle2 size={18} className="shrink-0" aria-hidden />}
      <p className="min-w-0 flex-1 basis-56 font-medium">
        {outcome === 'cancelled' ? t('cancelled')
          : active ? t('active', { name: tPlans(`${data.effective_plan_code}.name`) })
            : waiting ? t('confirming') : t('pending')}
      </p>
      {tone === 'pending' && (
        <button type="button" onClick={() => resync()} disabled={refresh.isPending}
          className="min-h-11 whitespace-nowrap rounded-full px-3 font-semibold underline underline-offset-4 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t('reload')}
        </button>
      )}
    </div>
  );
}
