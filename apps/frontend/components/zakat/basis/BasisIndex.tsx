'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BASIS_TOPICS, type BasisTopic } from './basisCatalog';

/** Les neuf fiches : leur nom et leur règle en une phrase ; chaque ligne ouvre sa fiche. */
export function BasisIndex({ onOpen }: { onOpen: (topic: BasisTopic) => void }) {
  const t = useTranslations('zakat.basis.topic');
  return (
    <ul className="divide-y divide-border">
      {BASIS_TOPICS.map((topic) => (
        <li key={topic}>
          <button
            type="button"
            data-topic={topic}
            onClick={() => onOpen(topic)}
            className="flex w-full items-center gap-3 rounded-lg py-3.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{t(`${topic}.name`)}</span>
              <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted-foreground">{t(`${topic}.rule`)}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
