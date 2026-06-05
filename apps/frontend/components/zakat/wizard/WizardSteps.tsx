import { Step0Liquidity } from '@/components/zakat/Step0Liquidity';
import { Step1Receivables } from '@/components/zakat/Step1Receivables';
import { Step2Stock } from '@/components/zakat/Step2Stock';
import { Step3Excluded } from '@/components/zakat/Step3Excluded';
import { Step4Debts } from '@/components/zakat/Step4Debts';
import { Step5Summary } from '@/components/zakat/Step5Summary';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import type { WizardState } from './types';

interface WizardStepsProps {
  step: number;
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  calc: ZakatCalculation | null;
  estimate: { stock_value_estimated?: string; product_count?: number } | undefined;
  estimateLoading: boolean;
  currency: string;
}

export function WizardSteps({ step, state, patch, calc, estimate, estimateLoading, currency }: WizardStepsProps) {
  if (step === 0) {
    return (
      <Step0Liquidity
        referenceDate={state.referenceDate}
        cashAmount={state.cashAmount}
        currency={currency}
        onChange={patch}
      />
    );
  }
  if (step === 1) {
    return (
      <Step1Receivables
        hasReceivables={state.hasReceivables}
        receivablesNominal={state.receivablesNominal}
        receivablesBreakdown={state.receivablesBreakdown}
        currency={currency}
        onChange={patch}
      />
    );
  }
  if (step === 2) {
    return (
      <Step2Stock
        estimatedStock={calc?.stock_value_estimated ?? estimate?.stock_value_estimated ?? '0'}
        productCount={estimate?.product_count ?? 0}
        stockBreakdown={state.stockBreakdown}
        currency={currency}
        isLoadingEstimate={estimateLoading}
        onChange={patch}
      />
    );
  }
  if (step === 3) {
    return <Step3Excluded acknowledged={state.excludedItemsAcknowledged} onChange={patch} />;
  }
  if (step === 4) {
    return <Step4Debts debts={state.debtsBreakdown} currency={currency} onChange={patch} />;
  }
  if (step === 5 && calc) return <Step5Summary calc={calc} />;
  if (step === 5) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Préparation du récapitulatif…
      </p>
    );
  }
  return null;
}
