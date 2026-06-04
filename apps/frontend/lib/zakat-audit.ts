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

import type { ZakatCalculation } from './hooks/useZakat';

export type AuditStatus = 'ok' | 'warn' | 'info';

export interface AuditCheck {
  key: string;
  label: string;
  status: AuditStatus;
  message?: string;
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
      label: 'Stock ventilé par catégorie',
      status: 'ok',
    });
  } else if (calc.stock_value_adjusted) {
    checks.push({
      key: 'stock',
      label: 'Stock ajusté manuellement',
      status: 'warn',
      message: 'Ventiler par catégorie (finis, matières, en cours) améliore la traçabilité.',
    });
  } else {
    checks.push({
      key: 'stock',
      label: 'Stock laissé sur estimation automatique',
      status: 'warn',
      message: 'Vous pouvez affiner avec un montant ajusté ou une ventilation par catégorie.',
    });
  }

  // 2. Créances — ventilation préférée si un montant est déclaré
  const receivablesTotal = parse(calc.receivables_amount);
  if (calc.receivables_breakdown && calc.receivables_breakdown.length > 0) {
    checks.push({
      key: 'receivables',
      label: 'Créances ventilées (certaines / probables / douteuses)',
      status: 'ok',
    });
  } else if (receivablesTotal > 0) {
    checks.push({
      key: 'receivables',
      label: 'Créances renseignées en bloc',
      status: 'warn',
      message: 'Ventiler par niveau de certitude permet d\'exclure les douteuses du calcul.',
    });
  } else {
    checks.push({
      key: 'receivables',
      label: 'Aucune créance déclarée',
      status: 'info',
    });
  }

  // 3. Exclus — au moins un item reconnu (informatif)
  if (calc.excluded_items_acknowledged.length > 0) {
    checks.push({
      key: 'excluded',
      label: `Outils de travail reconnus (${calc.excluded_items_acknowledged.length}/6)`,
      status: 'ok',
    });
  } else {
    checks.push({
      key: 'excluded',
      label: 'Aucun outil de travail reconnu',
      status: 'warn',
      message: 'Cocher les éléments que vous possédez rend la déclaration plus traçable.',
    });
  }

  // 4. Dettes — déclarées ou explicitement vides (informatif)
  if (calc.debts_breakdown.length > 0) {
    const hasDue = calc.debts_breakdown.some((d) => d.is_immediately_due);
    checks.push({
      key: 'debts',
      label: hasDue
        ? `Dettes ventilées (${calc.debts_breakdown.length}), exigibilité précisée`
        : `Dettes déclarées (${calc.debts_breakdown.length}), aucune exigible`,
      status: 'ok',
    });
  } else {
    checks.push({
      key: 'debts',
      label: 'Aucune dette déclarée',
      status: 'info',
    });
  }

  // 5. Nisab — configuré ou non
  const hasNisab = calc.nisab_threshold !== null && calc.nisab_threshold !== '';
  if (hasNisab) {
    checks.push({
      key: 'nisab',
      label: 'Seuil de Nisab configuré',
      status: 'ok',
    });
  } else {
    checks.push({
      key: 'nisab',
      label: 'Seuil de Nisab non configuré',
      status: 'warn',
      message: 'Sans Nisab, impossible de savoir automatiquement si la zakat est due.',
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
        label: 'Écart inhabituel entre stock estimé et ajusté',
        status: 'warn',
        message: `Stock ajusté à ${(ratio * 100).toFixed(0)}\u00a0% de l'estimation catalogue — confirmer la valeur saisie.`,
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
