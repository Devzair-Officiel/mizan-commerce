'use client';

import { usePathname } from 'next/navigation';
import { PastDueBanner } from '@/components/layout/PastDueBanner';
import { TrialEndBanner } from '@/components/layout/TrialEndBanner';
import { useMe } from '@/lib/hooks/useMe';
import { useSubscription } from '@/lib/hooks/useSubscription';

/** La page Abonnement porte déjà ces informations dans « Votre formule ». */
const SUBSCRIPTION_PATH = '/settings/subscription';

/**
 * Bandeau d'abonnement en tête de toutes les pages, pour le propriétaire et les admins (jamais les
 * employés) : paiement échoué, sinon fin d'essai proche ; jamais les deux à la fois.
 */
export function BillingBanner() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: subscription } = useSubscription();
  const role = me?.membership?.role;
  if (!subscription || !role || role === 'staff' || pathname.startsWith(SUBSCRIPTION_PATH)) return null;
  if (subscription.status === 'past_due' && subscription.stripe_managed) {
    return <PastDueBanner subscription={subscription} owner={role === 'owner'} />;
  }
  return <TrialEndBanner subscription={subscription} />;
}
