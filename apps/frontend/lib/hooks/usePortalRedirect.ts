'use client';

import { useState } from 'react';
import {
  billingErrorCode, billingErrorKey, useOpenPortal, useRefreshSubscription, type BillingErrorKey,
} from '@/lib/hooks/useBilling';
import { redirectToStripe } from '@/lib/stripe-redirect';

/**
 * Portail client Stripe (moyen de paiement, factures) : adresse demandée au serveur puis vérifiée
 * par `redirectToStripe`. `busy` reste vrai jusqu'au départ de la page ; erreur traduite sinon.
 */
export function usePortalRedirect() {
  const portal = useOpenPortal();
  const { mutate: resync } = useRefreshSubscription();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<BillingErrorKey | null>(null);

  async function open() {
    setError(null);
    try {
      const { url } = await portal.mutateAsync();
      redirectToStripe(url, 'portal');
      setLeaving(true);
    } catch (err) {
      // Compte de facturation absent côté serveur : l'état affiché est périmé.
      if (billingErrorCode(err) === 'no_billing_customer') resync();
      setError(billingErrorKey(err, 'portal_failed'));
    }
  }

  return { open, busy: portal.isPending || leaving, error };
}
