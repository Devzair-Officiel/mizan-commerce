/**
 * Audit automatique d'un calcul de zakat : heuristiques de complétude et de cohérence.
 *
 * On distingue trois niveaux :
 *  - `ok`    → le point a été traité de manière traçable
 *  - `warn`  → le point peut être affiné (pas bloquant, mais entame la fiabilité)
 *  - `info`  → information sans impact sur le score (ex. dettes vides volontairement)
 *
 * Le score est le ratio des `ok` sur les checks pondérés (les `info` ne comptent pas).
 */

import { EXCLUDED_ITEMS, type ZakatCalculation } from './hooks/useZakat';

export type AuditStatus = 'ok' | 'warn' | 'info';

export interface AuditCheck {
  key: string;
  /** Message sous `zakat.audit.{id}.label` (et `.message` si `hasMessage`). */
  id: string;
  status: AuditStatus;
  hasMessage?: boolean;
  values?: Record<string, number>;
}

export interface AuditResult {
  checks: AuditCheck[];
  score: number; // 0–100, arrondi
  okCount: number;
  warnCount: number;
}

function parse(v: string | null | undefined): number {
  return parseFloat(v ?? '0') || 0;
}

export function computeAuditChecks(calc: ZakatCalculation): AuditResult {
  const checks: AuditCheck[] = [];

  // 1. Stock — ventilé > ajusté > brut estimé
  if (calc.stock_breakdown && calc.stock_breakdown.length > 0) {
    checks.push({
      key: 'stock',
      id: 'stock_ventilated',
      status: 'ok',
    });
  } else if (calc.stock_value_adjusted) {
    checks.push({
      key: 'stock',
      id: 'stock_adjusted',
      status: 'warn',
      hasMessage: true,
    });
  } else {
    checks.push({
      key: 'stock',
      id: 'stock_estimated',
      status: 'warn',
      hasMessage: true,
    });
  }

  // 2. Créances — ventilation préférée si un montant est déclaré
  const receivablesTotal = parse(calc.receivables_amount);
  if (calc.receivables_breakdown && calc.receivables_breakdown.length > 0) {
    checks.push({
      key: 'receivables',
      id: 'receivables_ventilated',
      status: 'ok',
    });
  } else if (receivablesTotal > 0) {
    checks.push({
      key: 'receivables',
      id: 'receivables_bulk',
      status: 'warn',
      hasMessage: true,
    });
  } else {
    checks.push({
      key: 'receivables',
      id: 'receivables_none',
      status: 'info',
    });
  }

  // 3. Exclus — au moins un item reconnu (informatif)
  if (calc.excluded_items_acknowledged.length > 0) {
    checks.push({
      key: 'excluded',
      id: 'excluded_ok',
      status: 'ok',
      values: { count: calc.excluded_items_acknowledged.length, total: EXCLUDED_ITEMS.length },
    });
  } else {
    checks.push({
      key: 'excluded',
      id: 'excluded_none',
      status: 'warn',
      hasMessage: true,
    });
  }

  // 4. Dettes — déclarées ou explicitement vides (informatif)
  if (calc.debts_breakdown.length > 0) {
    const hasDue = calc.debts_breakdown.some((d) => d.is_immediately_due);
    checks.push({
      key: 'debts',
      id: hasDue ? 'debts_due' : 'debts_not_due',
      status: 'ok',
      values: { count: calc.debts_breakdown.length },
    });
  } else {
    checks.push({
      key: 'debts',
      id: 'debts_none',
      status: 'info',
    });
  }

  // 5. Nisab — configuré ou non
  const hasNisab = calc.nisab_threshold !== null && calc.nisab_threshold !== '';
  if (hasNisab) {
    checks.push({
      key: 'nisab',
      id: 'nisab_ok',
      status: 'ok',
    });
  } else {
    checks.push({
      key: 'nisab',
      id: 'nisab_missing',
      status: 'warn',
      hasMessage: true,
    });
  }

  // 6. Cohérence — si l'ajustement manuel du stock s'écarte fortement de l'estimé.
  const estimated = parse(calc.stock_value_estimated);
  const adjusted = calc.stock_value_adjusted ? parse(calc.stock_value_adjusted) : null;
  if (estimated > 0 && adjusted !== null) {
    const ratio = adjusted / estimated;
    if (ratio < 0.5 || ratio > 2) {
      checks.push({
        key: 'stock_coherence',
        id: 'stock_coherence',
        status: 'warn',
        hasMessage: true,
        values: { ratio: Math.round(ratio * 100) },
      });
    }
  }

  const okCount = checks.filter((c) => c.status === 'ok').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const weighted = okCount + warnCount; // les `info` n'entrent pas dans le score
  const score = weighted === 0 ? 100 : Math.round((okCount / weighted) * 100);

  return { checks, score, okCount, warnCount };
}

/** Étiquette qualitative dérivée du score, pour la pastille colorée. */
export function scoreTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}
