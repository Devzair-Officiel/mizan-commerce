'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { RESULT_STEP } from './stepNav';

interface WizardActionsProps {
  step: number;
  /** Un choix d'avis de l'étape reste à faire. */
  choicePending: boolean;
  busy: boolean;
  onPrevious: () => void;
  onContinue: () => void;
}

/** Desktop : « Précédent » et « Continuer » à droite, sous les cartes de l'étape. */
export function WizardActions({ step, choicePending, busy, onPrevious, onContinue }: WizardActionsProps) {
  const t = useTranslations('zakat.wizard');
  const label = choicePending ? t('choose') : t(step === RESULT_STEP - 1 ? 'to_result' : 'next');

  return (
    <div className="hidden items-center justify-end gap-2 lg:flex">
      {step > 0 && (
        <Button type="button" variant="ghost" onClick={onPrevious} disabled={busy} className="h-11 rounded-full px-5 text-sm font-semibold text-muted-foreground">
          {t('previous')}
        </Button>
      )}
      <Button type="button" onClick={onContinue} disabled={choicePending || busy} className="h-11 rounded-full px-5 text-sm font-semibold">
        {label}
      </Button>
    </div>
  );
}
