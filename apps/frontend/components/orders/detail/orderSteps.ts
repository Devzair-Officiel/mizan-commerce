import type { FulfillmentMode } from '@/lib/hooks/useMe';
import type { Order, OrderActivityEvent } from '@/lib/hooks/useOrders';
import { flowStatuses } from './constants';

export type StepState = 'done' | 'current' | 'upcoming' | 'cancelled';

export interface OrderStep {
  /** `created` pour la première étape, sinon un statut du parcours. */
  key: string;
  state: StepState;
  /** Moment où l'étape a été atteinte (étapes passées et annulation). */
  at?: string;
}

/**
 * Étapes du suivi : « Créée » puis le parcours de la boutique. Les heures viennent
 * de l'historique (dernier passage à chaque statut) ; le statut de départ compte
 * comme atteint à la création. Une commande annulée s'arrête à l'étape quittée,
 * suivie d'une étape « Annulée ».
 */
export function computeOrderSteps(order: Order, events: OrderActivityEvent[], fm: FulfillmentMode): OrderStep[] {
  const changes = events.filter((e) => e.type === 'status_change');
  // L'historique arrive du plus récent au plus ancien.
  const initial = changes.at(-1)?.data.from ?? order.status;
  const lastCancel = changes.find((e) => e.data.to === 'cancelled');
  const cancelled = order.status === 'cancelled';
  const reached = cancelled ? (lastCancel?.data.from ?? initial) : order.status;
  const flow = flowStatuses(fm, reached);
  const reachedIndex = Math.max(0, flow.indexOf(reached));
  const initialIndex = flow.indexOf(initial);

  const reachedAt = (status: string, i: number): string | undefined =>
    changes.find((e) => e.data.to === status)?.occurred_at
    ?? (i <= initialIndex ? order.created_at : undefined);

  const steps: OrderStep[] = [{ key: 'created', state: 'done', at: order.created_at }];
  flow.forEach((status, i) => {
    if (cancelled && i > reachedIndex) return;
    const last = i === flow.length - 1;
    const state: StepState = i < reachedIndex || (i === reachedIndex && (last || cancelled)) ? 'done'
      : i === reachedIndex ? 'current' : 'upcoming';
    steps.push({ key: status, state, at: state === 'done' ? reachedAt(status, i) : undefined });
  });
  if (cancelled) steps.push({ key: 'cancelled', state: 'cancelled', at: lastCancel?.occurred_at ?? order.cancelled_at ?? undefined });
  return steps;
}
