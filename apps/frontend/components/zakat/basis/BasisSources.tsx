'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { BasisBadge, BasisSource } from './basisCatalog';

const TONE: Record<BasisBadge, string> = {
  authentic: 'bg-green-500/10 text-green-700 dark:text-green-400',
  companion: 'bg-green-500/10 text-green-700 dark:text-green-400',
  discussed: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  school: 'bg-muted text-foreground',
  contemporary: 'bg-muted text-foreground',
};

/** Sources d'une fiche : ce qu'elles disent (style indirect), leur référence, leur badge (§ 2) et le jugement nommé. */
export function BasisSources({ sources }: { sources: readonly BasisSource[] }) {
  const t = useTranslations('zakat.basis');
  return (
    <ul className="space-y-2">
      {sources.map(({ key, badge, judged }) => (
        <li key={key} className="rounded-xl border border-border bg-background px-3.5 py-3">
          <p className="text-sm leading-normal text-foreground">{t(`source.${key}.text`)}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
            <span>{t(`source.${key}.ref`)}</span>
            <span className={cn('inline-flex h-5.5 items-center whitespace-nowrap rounded-full px-2 text-[0.71875rem] font-semibold', TONE[badge])}>
              {t(`badge.${badge}`)}
            </span>
          </div>
          {judged && <p className="mt-1.5 text-xs text-muted-foreground">{t(`source.${key}.judgment`)}</p>}
        </li>
      ))}
    </ul>
  );
}
