'use client';

import Link from 'next/link';
import { Scale, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

interface NisabCardProps {
  calc: ZakatCalculation;
}

const METHOD_LABEL: Record<string, string> = {
  silver: 'Argent (595 g)',
  gold: 'Or (85 g)',
};

export function NisabCard({ calc }: NisabCardProps) {
  // Nisab non configuré au moment du calcul → CTA pédagogique vers les paramètres.
  if (calc.nisab_threshold === null || calc.is_above_nisab === null) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1.5 flex-1">
          <p className="text-sm font-medium text-amber-900">Seuil de Nisab non configuré</p>
          <p className="text-xs text-amber-800">
            Le Nisab est le seuil de richesse en dessous duquel la zakat n&apos;est pas due. Configurez
            la méthode (or ou argent) et le prix au gramme pour obtenir un verdict d&apos;obligation.
          </p>
          <Link
            href="/settings"
            className="self-start mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:text-amber-700 transition-colors"
          >
            Configurer dans les paramètres
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    );
  }

  const above = calc.is_above_nisab;
  const methodLabel = METHOD_LABEL[calc.nisab_method] ?? calc.nisab_method;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 flex flex-col gap-3 ${
        above
          ? 'border-primary/30 bg-primary/5'
          : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <Scale className={above ? 'text-primary' : 'text-emerald-700'} size={16} />
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
          Seuil de Nisab
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Méthode {methodLabel}
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(calc.nisab_threshold, calc.currency)}
        </p>
      </div>

      <div className="h-px bg-border/60" />

      <div className="flex items-start gap-2">
        {above ? (
          <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={16} />
        ) : (
          <CheckCircle2 className="text-emerald-700 shrink-0 mt-0.5" size={16} />
        )}
        <div className="flex flex-col gap-0.5">
          {above ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Vous êtes au-dessus du Nisab
              </p>
              <p className="text-xs text-muted-foreground">
                Votre base ({formatMoney(calc.zakat_base, calc.currency)}) dépasse le seuil.
                La zakat est due.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-emerald-900">
                Vous êtes en dessous du Nisab
              </p>
              <p className="text-xs text-emerald-800">
                Votre base ({formatMoney(calc.zakat_base, calc.currency)}) reste sous le seuil —
                la zakat n&apos;est pas obligatoire cette année.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
