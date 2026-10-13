'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Scale, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

interface NisabCardProps {
  calc: ZakatCalculation;
}

export function NisabCard({ calc }: NisabCardProps) {
  const t = useTranslations('zakat.nisab');
  // Nisab non configuré au moment du calcul → CTA pédagogique vers les paramètres.
  if (calc.nisab_threshold === null || calc.is_above_nisab === null) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex gap-3">
        <AlertTriangle className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1.5 flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{t('not_configured')}</p>
          <p className="text-xs text-amber-800 dark:text-amber-200">{t('not_configured_help')}</p>
          <Link
            href="/settings"
            className="self-start mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
          >
            {t('configure')}
            <ArrowRight size={12} className="rtl:rotate-180" />
          </Link>
        </div>
      </div>
    );
  }

  const above = calc.is_above_nisab;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 flex flex-col gap-3 ${
        above
          ? 'border-primary/30 bg-primary/5'
          : 'border-emerald-500/25 bg-emerald-500/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <Scale className={above ? 'text-primary' : 'text-emerald-700 dark:text-emerald-400'} size={16} />
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{t('title')}</p>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('method', { method: calc.nisab_method })}</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(calc.nisab_threshold, calc.currency)}
        </p>
      </div>

      <div className="h-px bg-border/60" />

      <div className="flex items-start gap-2">
        {above ? (
          <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={16} />
        ) : (
          <CheckCircle2 className="text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" size={16} />
        )}
        <div className="flex flex-col gap-0.5">
          {above ? (
            <>
              <p className="text-sm font-medium text-foreground">{t('above_title')}</p>
              <p className="text-xs text-muted-foreground">
                {t('above', { amount: formatMoney(calc.zakat_base, calc.currency) })}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">{t('below_title')}</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-200">
                {t('below', { amount: formatMoney(calc.zakat_base, calc.currency) })}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
