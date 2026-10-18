'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { HeroFacts } from './useHeroFacts';

const ROW = 'flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0';

/** Mobile, sous l'anneau : seuil (avec « Mettre à jour ») et dernière zakat. */
export function HeroFactsMobile({ facts }: { facts: HeroFacts }) {
  const t = useTranslations('zakat.home');
  const { threshold, last } = facts;
  return (
    <ul className="border-t border-border lg:hidden">
      <li className={ROW}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground tabular-nums">{t('fact_threshold_short', { amount: threshold.value })}</p>
          {threshold.note && (
            <p className={cn('mt-0.5 text-xs', threshold.stale ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{threshold.note}</p>
          )}
        </div>
        <Link href="/zakat/reglages"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md px-1 text-[0.8125rem] font-semibold whitespace-nowrap text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
          {t('price_update')}
        </Link>
      </li>
      {last && (
        <li className={ROW}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground tabular-nums">{t('fact_last_short', { year: last.year, amount: last.value })}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{last.note}</p>
          </div>
        </li>
      )}
    </ul>
  );
}
