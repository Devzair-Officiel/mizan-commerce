'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * « Sûre » / « Douteuse » : une seule décision par créance. Boutons de 32 px dans un rail,
 * zone tactile portée à 44 px par un pseudo-élément ; flèches pour passer de l'un à l'autre.
 */
export function SureSegment({ doubtful, onChange, className }: { doubtful: boolean; onChange: (doubtful: boolean) => void; className?: string }) {
  const t = useTranslations('zakat.steps.receivables');
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    onChange(!doubtful);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }

  const option = (value: boolean, label: string) => (
    <button type="button" role="radio" aria-checked={doubtful === value} tabIndex={doubtful === value ? 0 : -1}
      onClick={() => onChange(value)} onKeyDown={onKeyDown}
      className={cn(
        'relative h-8 rounded-[0.5625rem] px-2.5 text-[0.78125rem] font-semibold whitespace-nowrap outline-none',
        'after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:ring-3 focus-visible:ring-primary/30',
        doubtful === value ? 'bg-card shadow-sm' : 'text-muted-foreground',
        doubtful === value && (value ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'),
      )}>
      {label}
    </button>
  );

  return (
    <div ref={ref} role="radiogroup" aria-label={t('segment_label')} className={cn('inline-flex gap-0.5 rounded-xl bg-muted p-0.75', className)}>
      {option(false, t('sure'))}
      {option(true, t('doubtful'))}
    </div>
  );
}
