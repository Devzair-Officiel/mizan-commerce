/** Page Stripe vers laquelle le serveur renvoie : paiement d'une formule ou portail client. */
export type StripeDestination = 'checkout' | 'portal';

/** Seuls hôtes acceptés, sans sous-domaine ni port : toute autre adresse est refusée. */
const STRIPE_HOSTS: Record<StripeDestination, string> = {
  checkout: 'checkout.stripe.com',
  portal: 'billing.stripe.com',
};

export class StripeRedirectError extends Error {}

/**
 * Adresse renvoyée par le serveur, vérifiée : https, hôte exact de la destination, sans
 * identifiants. Lève `StripeRedirectError` sinon (l'appelant affiche le message générique).
 */
function stripeUrl(raw: unknown, destination: StripeDestination): string {
  if (typeof raw !== 'string') throw new StripeRedirectError('Adresse de paiement absente');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new StripeRedirectError('Adresse de paiement illisible');
  }
  if (url.protocol !== 'https:' || url.host !== STRIPE_HOSTS[destination] || url.username || url.password) {
    throw new StripeRedirectError('Adresse de paiement refusée');
  }
  return url.href;
}

/** Quitte l'application vers la page Stripe, après vérification de l'adresse. */
export function redirectToStripe(raw: unknown, destination: StripeDestination): void {
  window.location.assign(stripeUrl(raw, destination));
}
