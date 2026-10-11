'use client';

import { ChevronLeft, Pencil, Wallet, Users, Package, ShieldCheck, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { useFormatDate } from '@/lib/hooks/useFormat';
import {
  formatMoney,
  sumImmediateDebts,
  type DebtItem,
  type ExcludedItem,
  type ReceivableBreakdownItem,
  type StockBreakdownItem,
  type ZakatCalculation,
} from '@/lib/hooks/useZakat';
import { Step5Summary } from './Step5Summary';

interface HubState {
  referenceDate: string;
  cashAmount: string;
  hasReceivables: boolean;
  receivablesNominal: string;
  receivablesBreakdown: ReceivableBreakdownItem[];
  stockBreakdown: StockBreakdownItem[];
  excludedItemsAcknowledged: ExcludedItem[];
  debtsBreakdown: DebtItem[];
}

interface WizardHubProps {
  calc: ZakatCalculation;
  state: HubState;
  currency: string;
  onEditStep: (step: number) => void;
  onFinalize: () => void;
  onDiscard: () => void;
  isPending?: boolean;
}

interface StepCardModel {
  step: number;
  Icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  summary: string;
}

function sumBreakdown(items: { amount: string }[]): number {
  return items.reduce((acc, it) => acc + (parseFloat(it.amount || '0') || 0), 0);
}

type HubT = ReturnType<typeof useTranslations<'zakat.wizard'>>;

function stockSummary(calc: ZakatCalculation, state: HubState, currency: string, t: HubT): string {
  // Même priorité que le backend : ventilé > ajusté > estimé.
  if (state.stockBreakdown.length > 0) {
    const amount = formatMoney(sumBreakdown(state.stockBreakdown), currency);
    return t('hub_stock_breakdown', { amount, count: state.stockBreakdown.length });
  }
  if (calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '') {
    return t('hub_stock_adjusted', { amount: formatMoney(calc.stock_value_adjusted, currency) });
  }
  return t('hub_stock_estimated', { amount: formatMoney(calc.stock_value_estimated, currency) });
}

function receivablesSummary(state: HubState, currency: string, t: HubT): string {
  // Ventilées : total certaines + probables ; sinon le nominal saisi.
  if (!state.hasReceivables) return t('hub_receivables_none');
  if (state.receivablesBreakdown.length > 0) {
    const recoverable = state.receivablesBreakdown
      .filter((r) => r.category !== 'doubtful')
      .reduce((acc, r) => acc + (parseFloat(r.amount || '0') || 0), 0);
    return t('hub_receivables_breakdown', { amount: formatMoney(recoverable, currency), count: state.receivablesBreakdown.length });
  }
  return t('hub_receivables_nominal', { amount: formatMoney(state.receivablesNominal || '0', currency) });
}

function buildCards(calc: ZakatCalculation, state: HubState, currency: string, t: HubT, refDate: string): StepCardModel[] {
  const excluded = state.excludedItemsAcknowledged.length;
  return [
    { step: 0, Icon: Wallet, label: t('steps.cash.title'), summary: t('hub_cash', { amount: formatMoney(state.cashAmount || '0', currency), date: refDate }) },
    { step: 1, Icon: Users, label: t('steps.receivables.title'), summary: receivablesSummary(state, currency, t) },
    { step: 2, Icon: Package, label: t('steps.stock.title'), summary: stockSummary(calc, state, currency, t) },
    {
      step: 3,
      Icon: ShieldCheck,
      label: t('hub_excluded_label'),
      summary: excluded === 0 ? t('hub_excluded_none') : t('hub_excluded_count', { count: excluded, total: 6 }),
    },
    {
      step: 4,
      Icon: Receipt,
      label: t('steps.debts.title'),
      // Total exigible (déduit), pas le total déclaré.
      summary: state.debtsBreakdown.length === 0
        ? t('hub_debts_none')
        : t('hub_debts', { count: state.debtsBreakdown.length, amount: formatMoney(sumImmediateDebts(state.debtsBreakdown), currency) }),
    },
  ];
}

export function WizardHub({
  calc,
  state,
  currency,
  onEditStep,
  onFinalize,
  onDiscard,
  isPending = false,
}: WizardHubProps) {
  const t = useTranslations('zakat.wizard');
  const formatDate = useFormatDate();
  const router = useRouter();
  const refDate = formatDate(state.referenceDate, { day: '2-digit', month: 'long', year: 'numeric' });
  const cards = buildCards(calc, state, currency, t, refDate);
  const finalizeLabel = isPending ? t('finalizing') : t('finalize');
  return (
    <div className="flex flex-col min-h-screen pb-44 lg:pb-24">
      <header className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => router.push('/zakat')}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('back')}
          >
            <ChevronLeft size={20} className="rtl:rotate-180" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{t('hub_title')}</p>
            <p className="text-xs text-muted-foreground">{t('hub_subtitle')}</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col gap-4 px-4 py-5">
        <div className="flex flex-col gap-2">
          {cards.map(({ step, Icon, label, summary }) => (
            <button
              key={step}
              type="button"
              onClick={() => onEditStep(step)}
              disabled={isPending}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-start hover:border-primary/40 active:scale-[0.99] transition disabled:opacity-50"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-muted text-muted-foreground shrink-0">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{t('hub_step', { step: step + 1 })}</p>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{summary}</p>
              </div>
              <Pencil size={16} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {t('hub_final_check')}
          </p>
          <Step5Summary calc={calc} />
        </div>

        <button
          type="button"
          onClick={onDiscard}
          disabled={isPending}
          className="self-center mt-2 text-xs text-muted-foreground hover:text-destructive underline disabled:opacity-50"
        >
          {t('discard')}
        </button>
      </main>

      <footer className="hidden lg:block lg:py-3">
        <Button onClick={onFinalize} disabled={isPending} className="w-full">{finalizeLabel}</Button>
      </footer>
      <FloatingActionBar variant="button">
        <Button onClick={onFinalize} disabled={isPending} className="w-full h-12 rounded-full shadow-lg">{finalizeLabel}</Button>
      </FloatingActionBar>
    </div>
  );
}
