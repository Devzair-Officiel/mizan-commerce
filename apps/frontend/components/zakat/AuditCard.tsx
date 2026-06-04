'use client';

import { CheckCircle2, AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { computeAuditChecks, scoreTier, type AuditCheck } from '@/lib/zakat-audit';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';

interface AuditCardProps {
  calc: ZakatCalculation;
}

const TIER_STYLES = {
  high: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-orange-50 border-orange-200 text-orange-700',
} as const;

const TIER_LABEL = {
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'À renforcer',
} as const;

function CheckRow({ check }: { check: AuditCheck }) {
  const Icon = check.status === 'ok' ? CheckCircle2 : check.status === 'warn' ? AlertTriangle : Info;
  const iconColor =
    check.status === 'ok'
      ? 'text-emerald-600'
      : check.status === 'warn'
        ? 'text-amber-600'
        : 'text-muted-foreground';
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/60 last:border-0">
      <Icon className={`shrink-0 mt-0.5 ${iconColor}`} size={16} />
      <div className="flex-1 flex flex-col gap-0.5">
        <p className="text-sm text-foreground">{check.label}</p>
        {check.message && <p className="text-xs text-muted-foreground">{check.message}</p>}
      </div>
    </div>
  );
}

export function AuditCard({ calc }: AuditCardProps) {
  const { checks, score, okCount, warnCount } = computeAuditChecks(calc);
  const tier = scoreTier(score);

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4 flex flex-col gap-3">
      {/* En-tête : score + verdict */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full border ${TIER_STYLES[tier]}`}>
          <ShieldCheck size={20} />
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-foreground tabular-nums">{score}</p>
            <p className="text-xs text-muted-foreground">/ 100</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Fiabilité <span className="font-medium">{TIER_LABEL[tier]}</span> — {okCount} OK
            {warnCount > 0 ? `, ${warnCount} à affiner` : ''}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Ce score reflète la complétude de votre déclaration, pas la validité religieuse du calcul.
        Les points marqués «&nbsp;à affiner&nbsp;» sont optionnels mais améliorent la traçabilité.
      </p>

      {/* Détail des checks */}
      <div className="flex flex-col">
        {checks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </div>
    </div>
  );
}
