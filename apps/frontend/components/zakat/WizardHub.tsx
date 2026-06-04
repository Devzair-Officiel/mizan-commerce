'use client';

import { ChevronLeft, Pencil, Wallet, Users, Package, ShieldCheck, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
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

function buildCards(calc: ZakatCalculation, state: HubState, currency: string): StepCardModel[] {
  const refDateLabel = new Date(state.referenceDate).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Stock : on reflète la même priorité que le backend (ventilé > ajusté > estimé).
  let stockSummary: string;
  if (state.stockBreakdown.length > 0) {
    const total = sumBreakdown(state.stockBreakdown);
    stockSummary = `${formatMoney(total, currency)} — ${state.stockBreakdown.length} catégorie${state.stockBreakdown.length > 1 ? 's' : ''}`;
  } else if (calc.stock_value_adjusted !== null && calc.stock_value_adjusted !== '') {
    stockSummary = `${formatMoney(calc.stock_value_adjusted, currency)} — ajusté`;
  } else {
    stockSummary = `${formatMoney(calc.stock_value_estimated, currency)} — estimation catalogue`;
  }

  // Créances : si breakdown non vide, total certaines+probables ; sinon nominal saisi.
  let receivablesSummary: string;
  if (!state.hasReceivables) {
    receivablesSummary = 'Aucune créance déclarée';
  } else if (state.receivablesBreakdown.length > 0) {
    const recoverable = state.receivablesBreakdown
      .filter((r) => r.category !== 'doubtful')
      .reduce((acc, r) => acc + (parseFloat(r.amount || '0') || 0), 0);
    receivablesSummary = `${formatMoney(recoverable, currency)} récupérables — ${state.receivablesBreakdown.length} ligne${state.receivablesBreakdown.length > 1 ? 's' : ''}`;
  } else {
    receivablesSummary = `${formatMoney(state.receivablesNominal || '0', currency)} — non ventilées`;
  }

  // Dettes : on distingue total exigible (déduit) vs total déclaré.
  let debtsSummary: string;
  if (state.debtsBreakdown.length === 0) {
    debtsSummary = 'Aucune dette déclarée';
  } else {
    const due = sumImmediateDebts(state.debtsBreakdown);
    debtsSummary = `${state.debtsBreakdown.length} dette${state.debtsBreakdown.length > 1 ? 's' : ''} — ${formatMoney(due, currency)} déductible${due === 1 ? '' : 's'}`;
  }

  return [
    {
      step: 0,
      Icon: Wallet,
      label: 'Argent disponible',
      summary: `${formatMoney(state.cashAmount || '0', currency)} — ${refDateLabel}`,
    },
    {
      step: 1,
      Icon: Users,
      label: 'Créances clients',
      summary: receivablesSummary,
    },
    {
      step: 2,
      Icon: Package,
      label: 'Stock commercial',
      summary: stockSummary,
    },
    {
      step: 3,
      Icon: ShieldCheck,
      label: 'Outils de travail (exclus)',
      summary:
        state.excludedItemsAcknowledged.length === 0
          ? 'Aucun outil reconnu'
          : `${state.excludedItemsAcknowledged.length}/6 reconnus`,
    },
    {
      step: 4,
      Icon: Receipt,
      label: 'Dettes',
      summary: debtsSummary,
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
  const router = useRouter();
  const cards = buildCards(calc, state, currency);

  return (
    <div className="flex flex-col min-h-screen pb-44 lg:pb-24">
      {/* En-tête : flèche retour + titre */}
      <header className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => router.push('/zakat')}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Modifier votre zakat</p>
            <p className="text-xs text-muted-foreground">
              Cliquez sur une étape pour ajuster ses valeurs.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-4 px-4 py-5">
        {/* Cartes éditables — 5 étapes de saisie. L'étape 5 (récap) est intégrée juste en dessous. */}
        <div className="flex flex-col gap-2">
          {cards.map(({ step, Icon, label, summary }) => (
            <button
              key={step}
              type="button"
              onClick={() => onEditStep(step)}
              disabled={isPending}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/40 active:scale-[0.99] transition disabled:opacity-50"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-muted text-muted-foreground shrink-0">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Étape {step + 1}</p>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{summary}</p>
              </div>
              <Pencil size={16} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* Récap (étape 6) — vérification finale, contient déjà projection + Nisab + audit */}
        <div className="flex flex-col gap-1 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Vérification finale
          </p>
          <Step5Summary calc={calc} />
        </div>

        <button
          type="button"
          onClick={onDiscard}
          disabled={isPending}
          className="self-center mt-2 text-xs text-muted-foreground hover:text-destructive underline disabled:opacity-50"
        >
          Abandonner ce brouillon
        </button>
      </main>

      {/* Pied : même positionnement que WizardLayout pour cohérence (mobile au-dessus de BottomNav). */}
      <footer className="fixed bottom-24 left-0 right-0 z-40 px-4 lg:static lg:bottom-auto lg:px-0 lg:py-3">
        <Button onClick={onFinalize} disabled={isPending} className="w-full">
          {isPending ? 'Finalisation…' : 'Finaliser la zakat'}
        </Button>
      </footer>
    </div>
  );
}
