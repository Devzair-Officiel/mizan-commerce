'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { StepLink } from './StepLink';
import { STEP_COUNT } from './stepNav';

interface StepBarProps {
  id: string;
  step: number;
  /** Nombre d'étapes validées : les précédentes portent une coche. */
  doneCount: number;
  onGo: (step: number) => void;
}

/** Desktop : les sept étapes, accessibles à tout moment (la saisie en cours est enregistrée avant). */
export function StepBar({ id, step, doneCount, onGo }: StepBarProps) {
  const t = useTranslations('zakat.wizard');

  return (
    <nav aria-label={t('steps_label')} className="mb-6 hidden lg:block">
      <ol className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: STEP_COUNT }, (_, i) => {
          const current = i === step;
          const done = i < doneCount && !current;
          const label = t(`step.${i}`);
          return (
            <li key={i} className="min-w-0">
              <StepLink
                id={id}
                step={i}
                onGo={onGo}
                aria-current={current ? 'step' : undefined}
                aria-label={done ? t('step_done', { label }) : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-2.5 py-2 text-[0.8125rem] font-medium outline-none transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-primary/30',
                  current ? 'border-border bg-card font-semibold text-foreground shadow-xs' : 'border-transparent hover:bg-primary/8',
                  done ? 'text-foreground' : !current && 'text-muted-foreground',
                )}
              >
                <span aria-hidden className={cn(
                  'flex size-6.5 shrink-0 items-center justify-center rounded-full text-[0.78125rem] font-semibold tabular-nums',
                  current ? 'bg-primary text-primary-foreground' : done ? 'bg-secondary text-secondary-foreground' : 'bg-muted',
                )}>
                  {done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="truncate">{label}</span>
              </StepLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
