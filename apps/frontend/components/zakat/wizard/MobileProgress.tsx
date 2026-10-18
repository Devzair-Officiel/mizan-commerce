'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';
import { STEP_COUNT } from './stepNav';

interface MobileProgressProps {
  step: number;
  /** Étapes validées (`current_step`). */
  doneCount: number;
  onGo: (step: number) => void;
}

/** Mobile : « Étape n sur 7 » ouvre la liste des étapes, toutes accessibles ; barres de progression dessous. */
export function MobileProgress({ step, doneCount, onGo }: MobileProgressProps) {
  const t = useTranslations('zakat.wizard');
  const [open, setOpen] = useState(false);
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => i);

  return (
    <div className="px-4 pt-1 pb-2.5 lg:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label={t('progress_label')} aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-1 text-[0.78125rem] font-semibold whitespace-nowrap text-muted-foreground">
        {t('progress', { n: step + 1, label: t(`step.${step}`) })}
        <ChevronDown className="size-4" aria-hidden />
      </button>
      <div className="flex gap-1" aria-hidden>
        {steps.map((i) => <i key={i} className={cn('h-1 flex-1 rounded-full', i <= Math.max(step, doneCount - 1) ? 'bg-primary' : 'bg-muted')} />)}
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('menu_title')}>
        <ol className="flex flex-col gap-1 p-3">
          {steps.map((i) => (
            <li key={i}>
              <button type="button" aria-current={i === step ? 'step' : undefined}
                aria-label={i < doneCount ? t('step_done', { label: t(`step.${i}`) }) : undefined}
                onClick={() => { setOpen(false); if (i !== step) onGo(i); }}
                className={cn('flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-[0.9375rem] active:scale-[0.98]', i === step ? 'bg-primary/8 font-semibold' : 'hover:bg-muted')}>
                <span className={cn('flex size-6.5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  i === step ? 'bg-primary text-primary-foreground' : i < doneCount ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground')}>
                  {i < doneCount && i !== step ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                {t(`step.${i}`)}
              </button>
            </li>
          ))}
        </ol>
      </BottomSheet>
    </div>
  );
}
