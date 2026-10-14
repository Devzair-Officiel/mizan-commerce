import type { ReactNode } from 'react';

/**
 * Numéro de commande ou de facture (« 2026-042 », « fact-141026-0007 »), isolé du sens du texte :
 * dans une phrase en arabe, l'algorithme bidi le réordonnerait en « 042-2026 ». Dans un message
 * traduit, l'entourer de la balise `<num>` et la rendre avec ce composant.
 */
export function OrderNumber({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** Rendu de la balise `<num>` d'un message traduit : `t.rich('order_ref', { number, num: orderNumberTag })`. */
export const orderNumberTag = (chunks: ReactNode) => <OrderNumber>{chunks}</OrderNumber>;

/** Même isolement dans un texte brut (titre de page, option de liste, message WhatsApp). */
export function isolateNumber(value: string): string {
  return `\u2066${value}\u2069`;
}
