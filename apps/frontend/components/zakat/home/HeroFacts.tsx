'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { ZakatFormat } from '../useZakatFormat';
import { resumeHref } from '../wizard/stepNav';
import type { HeroFacts as Facts } from './useHeroFacts';

const WARN = 'text-amber-700 dark:text-amber-400';

function Fact({ label, value, note, warn }: { label: string; value: ReactNode; note: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-3.5 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-[0.9375rem] font-semibold text-foreground tabular-nums">{value}</p>
      {note && <p className={cn('mt-0.5 text-xs', warn ? WARN : 'text-muted-foreground')}>{note}</p>}
    </div>
  );
}

/** Desktop : seuil (prix du gramme ancien signalé), calcul en cours, dernière zakat. */
export function HeroFacts({ facts, format }: { facts: Facts; format: ZakatFormat }) {
  const t = useTranslations('zakat.home');
  const { threshold, current, last } = facts;
  const resume = current && (
    <Link href={resumeHref(current.id, current.current_step)}
      className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-primary/30">
      {t('fact_current_resume')}
    </Link>
  );

  return (
    <div className="mt-5.5 grid grid-cols-3 gap-3 max-lg:hidden">
      <Fact label={threshold.label} value={threshold.value} note={threshold.note} warn={threshold.stale} />
      <Fact label={t('fact_current')} value={resume ?? t('fact_current_none')}
        note={current ? t('modified_on', { date: format.instantDate(current.updated_at) }) : ''} />
      {last && <Fact label={t('fact_last', { year: last.year })} value={last.value} note={last.note} />}
    </div>
  );
}
