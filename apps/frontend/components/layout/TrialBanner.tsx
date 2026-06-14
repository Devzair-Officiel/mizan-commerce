'use client';

/**
 * Bandeau global affiché aux comptes en essai 14j Boutique+.
 *
 * Trois états :
 * - Trial actif (>0 jours) → bandeau ambre cliquable vers /settings/subscription.
 * - Trial expiré ou pas de trial → rien (le gating se charge du blocage).
 * - Loading ou pas de souscription → rien (pas de flash UI).
 *
 * Volontairement silencieux sur erreur : un user dont la subscription est
 * inaccessible (ex. 401 résiduel) ne doit pas voir un message d'erreur
 * en haut de chaque page.
 */

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useSubscription } from '@/lib/hooks/useSubscription';

export function TrialBanner() {
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading || !subscription) return null;
  if (subscription.status !== 'trialing') return null;
  const days = subscription.days_remaining;
  if (days === null || days < 0) return null;

  const label = days === 0
    ? "Votre essai Boutique+ se termine aujourd'hui."
    : days === 1
      ? 'Votre essai Boutique+ se termine demain.'
      : `Votre essai Boutique+ se termine dans ${days} jours.`;

  return (
    <Link
      href="/settings/subscription"
      className="block bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors"
    >
      <div className="flex items-center gap-2 max-w-screen-lg mx-auto">
        <Sparkles size={16} className="shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs font-medium underline underline-offset-2">
          Gérer
        </span>
      </div>
    </Link>
  );
}
