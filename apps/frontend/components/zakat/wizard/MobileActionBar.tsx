'use client';

import { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { ZakatFormat } from '../useZakatFormat';
import { CalculationAside } from './CalculationAside';
import { RESULT_STEP } from './stepNav';

interface MobileActionBarProps {
  calc: ZakatCalculation;
  step: number;
  format: ZakatFormat;
  choicePending: boolean;
  busy: boolean;
  onContinue: () => void;
}

/** Mobile : la base au fil de la saisie (ouvre « Votre calcul ») et « Continuer », au-dessus de la barre du bas. */
export function MobileActionBar({ calc, step, format, choicePending, busy, onContinue }: MobileActionBarProps) {
  const t = useTranslations('zakat');
  const [open, setOpen] = useState(false);
  const base = calc.totals.nisab_compared_amount;
  const label = choicePending ? t('wizard.choose') : t(step === RESULT_STEP - 1 ? 'wizard.to_result' : 'wizard.next');

  return (
    <>
      <FloatingActionBar>
        <button type="button" onClick={() => setOpen(true)} aria-label={t('wizard.mini_label')} aria-haspopup="dialog"
          className="flex min-h-11 min-w-0 flex-col items-start justify-center text-start whitespace-nowrap active:scale-[0.98]">
          <span className="flex items-center gap-1 text-[0.71875rem] text-muted-foreground">
            {t(calc.current_step < RESULT_STEP ? 'aside.base_provisional' : 'aside.base')}
            <ChevronUp className="size-3.5" aria-hidden />
          </span>
          <span className="text-[0.9375rem] font-bold tabular-nums text-foreground">{base === null ? '—' : format.money(base)}</span>
        </button>
        <button type="button" onClick={onContinue} disabled={choicePending || busy}
          className="flex h-11 flex-1 items-center justify-center rounded-full bg-primary px-4 text-[0.9375rem] font-semibold whitespace-nowrap text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-45">
          {label}
        </button>
      </FloatingActionBar>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('aside.title')} description={t('aside.hint')}>
        <CalculationAside calc={calc} step={step} format={format} bare />
      </BottomSheet>
    </>
  );
}
