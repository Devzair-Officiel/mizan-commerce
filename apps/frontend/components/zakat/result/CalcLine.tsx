'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { StepLink } from '../wizard/StepLink';
import type { ResultLine } from './useResultLines';

const GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_auto_1.75rem] items-center gap-2 px-4 py-2.75 text-[0.84375rem] lg:grid-cols-[1.75rem_minmax(0,1fr)_auto_2.25rem] lg:px-5 lg:py-3 lg:text-sm';
const CHIP =
  'inline-flex h-5.5 items-center rounded-full border border-border bg-card px-2 text-[0.71875rem] font-semibold whitespace-nowrap text-muted-foreground';

interface CalcLineProps {
  line: ResultLine;
  id: string;
  onGo: (step: number) => void;
}

/** Une ligne du calcul ; une ligne saisie s'ouvre sur son étape (toute la ligne est le lien). */
export function CalcLine({ line, id, onGo }: CalcLineProps) {
  const t = useTranslations('zakat.result.line');
  const toned = cn(line.tone && 'bg-muted/55 font-semibold', line.tone === 'total' && 'lg:text-base');
  const content = (
    <>
      <span aria-hidden className="text-center font-bold text-muted-foreground">{line.op}</span>
      <span className="flex min-w-0 flex-col items-start lg:flex-row lg:flex-wrap lg:items-center lg:gap-2">
        <span className="max-lg:hidden">{line.label}</span>
        <span className="lg:hidden">{line.shortLabel ?? line.label}</span>
        {line.source && (
          <>
            <span className="mt-px text-[0.71875rem] text-muted-foreground lg:hidden">{line.note ?? line.source}</span>
            <span className={cn(CHIP, 'max-lg:hidden')}>{line.source}</span>
          </>
        )}
      </span>
      <span className="whitespace-nowrap tabular-nums">{line.value}</span>
      {line.step === undefined ? <span /> : <Pencil aria-hidden className="size-4 justify-self-center text-muted-foreground" />}
    </>
  );

  return (
    <li className="border-b border-border last:border-b-0">
      {line.step === undefined ? (
        <div className={cn(GRID, toned)}>{content}</div>
      ) : (
        <StepLink id={id} step={line.step} onGo={onGo}
          className={cn(GRID, 'min-h-11 outline-none hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset')}>
          {content}
          <span className="sr-only">{t('edit')}</span>
        </StepLink>
      )}
    </li>
  );
}
