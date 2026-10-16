'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { PlanCode } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface PlanTabsProps {
  codes: readonly PlanCode[];
  active: PlanCode;
  onChange: (code: PlanCode) => void;
}

/** Onglets des formules sur mobile : une carte à la fois (flèches au clavier, sens de lecture respecté). */
export function PlanTabs({ codes, active, onChange }: PlanTabsProps) {
  const t = useTranslations('settings.subscription');
  const refs = useRef<Partial<Record<PlanCode, HTMLButtonElement | null>>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
    const next = codes[(codes.indexOf(active) + step + codes.length) % codes.length];
    if (!next) return;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={t('plans_label')} onKeyDown={onKeyDown} className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1 lg:hidden">
      {codes.map((code) => {
        const selected = code === active;
        return (
          <button key={code} ref={(el) => { refs.current[code] = el; }} type="button" role="tab" id={`plan-tab-${code}`}
            aria-selected={selected} aria-controls={`plan-card-${code}`} tabIndex={selected ? 0 : -1} onClick={() => onChange(code)}
            className={cn(
              'h-11 min-w-0 truncate rounded-lg px-0.5 text-xs transition-colors sm:text-[0.8125rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}>
            {t(`plans.${code}.name`)}
          </button>
        );
      })}
    </div>
  );
}
