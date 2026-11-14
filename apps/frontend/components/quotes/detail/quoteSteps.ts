import type { Quote } from '@/lib/hooks/useQuotes';

export type QuoteStepState = 'done' | 'current' | 'upcoming' | 'cancelled';
/** `waiting` et `to_invoice` : étape en attente (réponse du client, facturation). */
export type QuoteStepKey = 'created' | 'sent' | 'waiting' | 'accepted' | 'to_invoice' | 'invoiced' | 'declined' | 'expired';

export interface QuoteStep {
  key: QuoteStepKey;
  state: QuoteStepState;
  /** Heure de l'étape passée, quand le devis la garde. */
  at: string | null;
}

/** Créé, envoyé, puis la réponse : en attente → accepté → à facturer → facturé, ou refusé, ou expiré. */
export function computeQuoteSteps(q: Quote): QuoteStep[] {
  const steps: QuoteStep[] = [{ key: 'created', state: 'done', at: q.created_at }, { key: 'sent', state: 'done', at: q.sent_at }];
  const accepted: QuoteStep = { key: 'accepted', state: 'done', at: q.accepted_at };
  switch (q.status) {
    case 'sent': return [...steps, { key: 'waiting', state: 'current', at: null }, { key: 'invoiced', state: 'upcoming', at: null }];
    case 'accepted': return [...steps, accepted, { key: 'to_invoice', state: 'current', at: null }];
    case 'invoiced': return [...steps, accepted, { key: 'invoiced', state: 'done', at: null }];
    case 'declined': return [...steps, { key: 'declined', state: 'cancelled', at: q.declined_at }];
    case 'expired': return [...steps, { key: 'expired', state: 'cancelled', at: null }];
    default: return steps;
  }
}
