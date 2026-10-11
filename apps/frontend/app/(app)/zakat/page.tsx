'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { TOTAL_STEPS } from '@/components/zakat/WizardLayout';
import { HistoryChart } from '@/components/zakat/HistoryChart';
import {
  formatMoney,
  useZakatCalculations,
  useZakatCurrentDraft,
  useZakatStockEstimate,
} from '@/lib/hooks/useZakat';

export default function ZakatPage() {
  const t = useTranslations('zakat.home');
  const formatDate = useFormatDate();
  const { data: estimate } = useZakatStockEstimate();
  const { data: draft } = useZakatCurrentDraft();
  const { data: finalized, isLoading } = useZakatCalculations('finalized');

  const currency = estimate?.currency ?? 'EUR';
  const draftStepLabel = draft ? t('draft_step', { step: draft.current_step + 1, total: TOTAL_STEPS }) : null;

  // Un seul calcul finalisé par cycle annuel — si l'année en cours est déjà couverte,
  // on remplace le CTA par un raccourci vers ce calcul plutôt que d'autoriser un doublon.
  const currentYear = new Date().getFullYear();
  const currentYearFinalized = (finalized?.results ?? []).find(
    (c) => new Date(c.reference_date).getFullYear() === currentYear,
  );

  return (
    <>
      <TopBar title={t('title')} />
      <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Bandeau pédagogique permanent — la zakat reste un avis spirituel */}
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
            {t('notice_title')}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('notice')}
          </p>
        </div>

        {/* Reprise de brouillon — toujours en haut quand il existe */}
        {draft && (
          <Link
            href="/zakat/new"
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
          >
            <RefreshCw className="text-primary shrink-0" size={20} />
            <div className="flex-1 flex flex-col">
              <p className="text-sm font-medium text-foreground">{t('resume')}</p>
              <p className="text-xs text-muted-foreground">{draftStepLabel}</p>
            </div>
            <ArrowRight className="text-primary shrink-0 rtl:rotate-180" size={18} />
          </Link>
        )}

        {/* Carte d'estimation stock */}
        {estimate && (
          <div className="rounded-2xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground mb-1">
              {t('stock_estimate')}
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {formatMoney(estimate.stock_value_estimated, estimate.currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('stock_count', { count: estimate.product_count })}
            </p>
          </div>
        )}

        {/* Raccourci si la zakat de l'année est déjà figée — un hawl, un justificatif. */}
        {!draft && currentYearFinalized && (
          <Link
            href={`/zakat/${currentYearFinalized.id}`}
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 hover:bg-emerald-500/15 transition-colors"
          >
            <CheckCircle2 className="text-emerald-700 dark:text-emerald-400 shrink-0" size={20} />
            <div className="flex-1 flex flex-col">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                {t('year_done', { year: String(currentYear) })}
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-200 tabular-nums">
                {t('year_done_amount', { amount: formatMoney(currentYearFinalized.zakat_amount, currentYearFinalized.currency) })}
              </p>
            </div>
            <ArrowRight className="text-emerald-700 dark:text-emerald-400 shrink-0 rtl:rotate-180" size={18} />
          </Link>
        )}

        {/* CTA principal — masqué quand un brouillon existe ou que l'année est déjà bouclée. */}
        {!draft && !currentYearFinalized && (
          <Link href="/zakat/new" className={cn(buttonVariants(), 'w-full')}>
            <Sparkles size={16} className="me-2" />
            {t('start')}
          </Link>
        )}

        {/* Historique des calculs finalisés */}
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">{t('loading')}</p>
        )}

        {!isLoading && (finalized?.results ?? []).length >= 2 && (
          <HistoryChart calculations={finalized!.results} />
        )}

        {!isLoading && (finalized?.results ?? []).length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              {t('history')}
            </p>
            {finalized!.results.map((c) => (
              <Link
                key={c.id}
                href={`/zakat/${c.id}`}
                className="rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(c.reference_date, { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-base font-semibold text-foreground tabular-nums">
                    {formatMoney(c.zakat_amount, c.currency)}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    <span className="tabular-nums">{t('base', { amount: formatMoney(c.zakat_base, c.currency) })}</span>
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    <FileText size={12} />
                    {t('pdf_available')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && (finalized?.results ?? []).length === 0 && !draft && (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t('empty')}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground text-center px-4 mt-2">
          {t('currency', { currency })}
        </p>
      </div>
    </>
  );
}
