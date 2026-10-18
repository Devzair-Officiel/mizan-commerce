'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StepLink } from '../wizard/StepLink';
import type { ChoiceSummaryRow } from './useChoiceSummary';

interface ChoiceRowsProps {
  id: string;
  rows: ChoiceSummaryRow[];
  onGo: (step: number) => void;
}

/** Un choix par ligne (« Seuil », « Argent, 595 g à 2,40 € le gramme ») ; la ligne ouvre l'étape où il se change. */
export function ChoiceRows({ id, rows, onGo }: ChoiceRowsProps) {
  const t = useTranslations('zakat.common');
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.key} className="border-b border-border last:border-b-0">
          <StepLink id={id} step={row.step} onGo={onGo}
            className="flex min-h-11 items-center justify-between gap-3 px-5 py-3.25 outline-none hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset">
            <span className="min-w-0">
              <span className="block text-[0.8125rem] text-muted-foreground">{row.label}</span>
              <span className="mt-0.5 block text-sm font-semibold text-foreground">{row.value}</span>
            </span>
            <Pencil aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">{t('modify')}</span>
          </StepLink>
        </li>
      ))}
    </ul>
  );
}
