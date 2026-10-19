import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { HawlCalendar, LineScope } from './useZakat';

// ── Suivi à l'encaissement (référentiel D3 et D4) ────────────────────────────

export type FollowUpKind = 'sure' | 'doubtful';
export type FollowUpState = 'cancelled' | 'ignored' | 'pending' | 'choice_needed' | 'to_pay' | 'paid' | 'nothing_due';

/** Options D4 dans l'ordre du référentiel : aucune n'est recommandée ni cochée d'avance. */
export const DOUBTFUL_OPTIONS = ['all_years', 'one_year', 'new_year'] as const;
export type DoubtfulOption = (typeof DOUBTFUL_OPTIONS)[number];

/** Une fiche où figure une créance douteuse : zakat de l'encaissé pour cette année, ou la raison de l'exclusion. */
export interface FollowUpYear {
  calculation_id: string;
  hawl_calendar: HawlCalendar;
  hawl_year: number;
  amount: string | null;
  excluded: 'below_nisab' | 'incomplete' | null;
}

/**
 * Créance suivie, calculée par le serveur à la lecture (montants en chaînes décimales).
 * `calculation_id` / `line_id` : la ligne de la fiche d'origine, où s'écrivent les actions.
 */
export interface FollowUpItem {
  calculation_id: string;
  line_id: string;
  hawl_calendar: HawlCalendar;
  hawl_year: number;
  kind: FollowUpKind;
  order_id: string | null;
  order_number: string | null;
  customer_name: string | null;
  label: string;
  scope: LineScope;
  currency: string;
  amount: string;
  collected: string;
  /** Date saisie avec « Encaissée » (créance hors commande) ; une commande n'en a pas. */
  collected_on: string | null;
  order_state: 'open' | 'cancelled' | 'removed' | null;
  below_nisab: boolean;
  /** Créance sûre : sa part de la zakat à l'encaissement de la fiche. */
  part: string | null;
  years: FollowUpYear[];
  options: Record<DoubtfulOption, string> | null;
  option: DoubtfulOption | null;
  due: string;
  paid: string;
  remaining: string;
  state: FollowUpState;
  can_revert_paid: boolean;
}

export type FollowUpRevert = 'paid' | 'ignore' | 'collected';

export type FollowUpAction =
  | { action: 'option'; option: DoubtfulOption }
  | { action: 'collected'; collected_on: string; amount: string }
  | { action: 'paid'; amount: string }
  | { action: 'ignore' }
  | { action: 'revert'; revert: FollowUpRevert };

/** 409 : la créance a changé entre-temps (déjà versée, montant recalculé) ; son état actuel. */
export function followUpConflictOf(error: unknown): FollowUpItem | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const data = error.data as { item?: FollowUpItem } | null;
  return data?.item ?? null;
}

/** Créances qui appellent une action (carte « À verser à l'encaissement » de l'accueil). */
export function useZakatFollowUps() {
  return useQuery({
    queryKey: qk.zakat.followups,
    queryFn: () => apiFetch<FollowUpItem[]>('/zakat/followups/'),
  });
}

/** Créances suivies d'une fiche (écran Résultat) : vide tant que son jour J n'est pas passé. */
export function useCalculationFollowUps(id: string) {
  return useQuery({
    queryKey: qk.zakat.calculationFollowups(id),
    queryFn: () => apiFetch<FollowUpItem[]>(`/zakat/calculations/${id}/followups/`),
  });
}

/** Action de la personne ; succès ou conflit, tout le suivi est relu (une créance figure sur plusieurs fiches). */
export function useFollowUpAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, action }: { item: FollowUpItem; action: FollowUpAction }) =>
      apiFetch<FollowUpItem>(`/zakat/calculations/${item.calculation_id}/followups/${item.line_id}/`, {
        method: 'POST',
        body: JSON.stringify(action),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.zakat.followups }),
  });
}
