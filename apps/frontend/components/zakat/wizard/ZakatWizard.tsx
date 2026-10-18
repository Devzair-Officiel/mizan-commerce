'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FORM_COLUMNS } from '@/components/form/fieldStyles';
import { TopBar } from '@/components/layout/TopBar';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { ResultView } from '../result/ResultView';
import { useZakatFormat } from '../useZakatFormat';
import { CalculationAside } from './CalculationAside';
import { MobileActionBar } from './MobileActionBar';
import { MobileProgress } from './MobileProgress';
import { SaveStatus } from './SaveStatus';
import { StepBar } from './StepBar';
import { StepContent } from './StepContent';
import { missingStepChoices, RESULT_STEP } from './stepNav';
import { useWizardNav } from './useWizardNav';
import { useZakatAutosave } from './useZakatAutosave';
import { WizardActions } from './WizardActions';

/**
 * Assistant d'une fiche (§ 11, écran de saisie) : barre d'étapes et colonne « Votre calcul » sur desktop ;
 * sur mobile, « Étape n sur 7 » et la barre d'action au-dessus de la barre du bas (§ 8).
 */
export function ZakatWizard({ calc, step }: { calc: ZakatCalculation; step: number }) {
  const t = useTranslations('zakat.wizard');
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const autosave = useZakatAutosave(calc.id);
  const format = useZakatFormat(calc.currency);
  const nav = useWizardNav(calc, step, autosave);
  const choicePending = missingStepChoices(calc, step).length > 0;
  const date = format.longDate(calc.reference_date);
  const subtitle = calc.reference_hijri ? t('subtitle', { date, hijri: format.hijri(calc.reference_hijri) }) : date;
  const props = { calc, save: autosave.save, format };

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar
        title={t(calc.review.is_live ? 'title' : 'title_past', { year: String(calc.hawl_year) })}
        shortTitle={t('short_title', { year: String(calc.hawl_year) })}
        subtitle={isDesktop ? subtitle : undefined}
        back backLabel={t('back')} onBack={() => router.push('/zakat')} hideSearch
        action={<SaveStatus status={autosave.status} onRetry={() => void autosave.flush()} />}
      />
      <MobileProgress step={step} doneCount={calc.current_step} onGo={nav.go} />
      <div className="px-4 pt-2 pb-28 lg:pt-0 lg:pb-8">
        <StepBar id={calc.id} step={step} doneCount={calc.current_step} onGo={nav.go} />
        {step === RESULT_STEP ? (
          <ResultView {...props} onGo={nav.go} onPrevious={nav.previous} />
        ) : (
          <div className={FORM_COLUMNS}>
            <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
              <StepContent key={autosave.resetKey} step={step} yearTaken={autosave.yearTaken} {...props} />
              <WizardActions step={step} choicePending={choicePending} busy={nav.busy} onPrevious={nav.previous} onContinue={nav.next} />
            </div>
            <div className="max-lg:hidden lg:sticky lg:top-6">
              <CalculationAside calc={calc} step={step} format={format} />
            </div>
          </div>
        )}
      </div>
      {step !== RESULT_STEP && (
        <MobileActionBar calc={calc} step={step} format={format} choicePending={choicePending} busy={nav.busy} onContinue={nav.next} />
      )}
    </div>
  );
}
