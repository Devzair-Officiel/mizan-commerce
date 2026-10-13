'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Scale, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';
import { useShop } from '@/lib/hooks/useShop';
import { ReligiousNote } from './ReligiousNote';
import { AuditCard } from './AuditCard';

interface Step5Props {
  calc: ZakatCalculation;
}

interface RowProps {
  label: string;
  amount: string | number;
  currency: string;
  tone?: 'add' | 'sub' | 'neutral';
}

function Row({ label, amount, currency, tone = 'neutral' }: RowProps) {
  const color =
    tone === 'add' ? 'text-foreground' : tone === 'sub' ? 'text-destructive' : 'text-foreground';
  const sign = tone === 'sub' ? '−' : tone === 'add' ? '+' : '';
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/60 last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium tabular-nums ${color}`}>
        {sign} {formatMoney(amount, currency)}
      </p>
    </div>
  );
}

const NISAB_GRAMS: Record<'silver' | 'gold', number> = { silver: 595, gold: 85 };

export function Step5Summary({ calc }: Step5Props) {
  const t = useTranslations('zakat');
  const { data: shop } = useShop();
  const stockForBase = calc.stock_value_for_base;
  const stockVentilated = calc.stock_breakdown && calc.stock_breakdown.length > 0;
  const stockAdjusted = !stockVentilated && calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '';
  const stockLabel = t('step.summary.stock', {
    state: stockVentilated ? 'ventilated' : stockAdjusted ? 'adjusted' : 'estimated',
  });

  // Projection client-side : sur un brouillon, le serveur n'a pas encore calculé zakat_base
  // (gelé seulement à la finalisation). On reproduit ici la même formule pour donner l'aperçu.
  const cash = parseFloat(calc.cash_amount || '0');
  const receivables = parseFloat(calc.receivables_amount || '0');
  const stock = parseFloat(stockForBase || '0');
  const debts = parseFloat(calc.short_term_debts || '0');
  const projectedBase = Math.max(0, cash + receivables + stock - debts);
  const projectedAmount = projectedBase * parseFloat(calc.zakat_rate);

  // Préview Nisab : on calcule le seuil côté client à partir des paramètres boutique en cours,
  // puisque le serveur ne le snapshote qu'à la finalisation.
  const nisabUnitPrice = shop?.nisab_unit_price ? parseFloat(shop.nisab_unit_price) : null;
  const nisabMethod = shop?.nisab_method ?? 'silver';
  const nisabThreshold =
    nisabUnitPrice && nisabUnitPrice > 0 ? nisabUnitPrice * NISAB_GRAMS[nisabMethod] : null;
  const isAboveNisab = nisabThreshold !== null ? projectedBase >= nisabThreshold : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{t('step.summary.title')}</p>
          <p className="text-xs text-muted-foreground">{t('step.summary.help')}</p>
        </div>
      </div>

      {/* Patrimoine entrant */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t('step.summary.wealth')}
        </p>
        <Row
          label={t('common.cash')}
          amount={calc.cash_amount}
          currency={calc.currency}
          tone="add"
        />
        <Row
          label={t('common.receivables')}
          amount={calc.receivables_amount}
          currency={calc.currency}
          tone="add"
        />
        <Row
          label={stockLabel}
          amount={stockForBase}
          currency={calc.currency}
          tone="add"
        />
      </div>

      {/* Déductions */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t('step.summary.deductions')}
        </p>
        <Row
          label={t('step.summary.debts')}
          amount={calc.short_term_debts}
          currency={calc.currency}
          tone="sub"
        />
      </div>

      {/* Résultat clé — projection client-side (le serveur fige à la finalisation) */}
      <div className="rounded-2xl bg-primary text-primary-foreground px-5 py-5 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs uppercase tracking-wide opacity-80">{t('step.summary.base')}</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatMoney(projectedBase, calc.currency)}
          </p>
        </div>
        <div className="h-px bg-primary-foreground/20" />
        <div className="flex flex-col gap-0.5">
          <p className="text-xs uppercase tracking-wide opacity-80">
            {t('step.summary.due', { rate: (parseFloat(calc.zakat_rate) * 100).toFixed(2) })}
          </p>
          <p className="text-3xl font-bold tabular-nums">
            {formatMoney(projectedAmount, calc.currency)}
          </p>
        </div>
      </div>

      {/* Préview Nisab — verdict d'obligation calculé côté client avant la finalisation. */}
      {nisabThreshold !== null && isAboveNisab !== null ? (
        <div
          className={`rounded-2xl border px-4 py-3 flex flex-col gap-2 ${
            isAboveNisab
              ? 'border-primary/30 bg-primary/5'
              : 'border-emerald-500/25 bg-emerald-500/10'
          }`}
        >
          <div className="flex items-center gap-2">
            <Scale className={isAboveNisab ? 'text-primary' : 'text-emerald-700 dark:text-emerald-400'} size={16} />
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{t('nisab.title')}</p>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('nisab.method', { method: nisabMethod })}</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(nisabThreshold, calc.currency)}
            </p>
          </div>
          <p className={`text-xs ${isAboveNisab ? 'text-muted-foreground' : 'text-emerald-800 dark:text-emerald-200'}`}>
            {isAboveNisab ? t('nisab.preview_above') : t('nisab.preview_below')}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex gap-3">
          <AlertTriangle className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
          <div className="flex flex-col gap-1.5 flex-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{t('nisab.not_configured')}</p>
            <p className="text-xs text-amber-800 dark:text-amber-200">{t('nisab.not_configured_short')}</p>
            <Link
              href="/settings"
              className="self-start mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
            >
              {t('nisab.configure')}
              <ArrowRight size={12} className="rtl:rotate-180" />
            </Link>
          </div>
        </div>
      )}

      {/* Audit automatique — visible avant validation pour permettre au commerçant de revenir affiner */}
      <AuditCard calc={calc} />

      <ReligiousNote rubric="nisab" />
      <ReligiousNote rubric="rate" />

      <p className="text-xs text-muted-foreground px-1 text-center">{t('step.summary.footer')}</p>
    </div>
  );
}
