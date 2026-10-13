'use client';

import type { ChangeEvent } from 'react';
import { ClipboardCheck, PackageX, SearchX, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormRequiredSection } from '@/components/form/FormRequiredSection';
import { EXIT_MOTIVES, type StockExitForm, type StockExitMotive } from './useStockExitForm';

const ICONS = { loss: SearchX, breakage: PackageX, internal_use: Store, adjustment: ClipboardCheck } as const;

interface ExitReasonSectionProps {
  form: StockExitForm;
  /** Passage de/vers la correction : les quantités changent de sens (sortie ↔ comptée). */
  onChange: (reason: StockExitMotive) => void;
}

/** « Motif de la sortie » (obligatoire) : perte, casse, usage interne ou correction d'inventaire, en cartes radio. */
export function ExitReasonSection({ form, onChange }: ExitReasonSectionProps) {
  const t = useTranslations('stock.exit');
  const error = form.formState.errors.reason?.message;
  return (
    <FormRequiredSection title={t('reason_title')} description={t('reason_help')}>
      <div className="col-span-full flex flex-col gap-1.5">
        <div role="radiogroup" aria-label={t('reason_title')} aria-required aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'stock-exit-reason-error' : undefined} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EXIT_MOTIVES.map((value) => {
            const Icon = ICONS[value];
            return (
              <label key={value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-primary/20">
                <input type="radio" value={value} {...form.register('reason', {
                  onChange: (e: ChangeEvent<HTMLInputElement>) => { const next = EXIT_MOTIVES.find((m) => m === e.target.value); if (next) onChange(next); },
                })} className="sr-only" />
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground" aria-hidden>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t(`reason.${value}`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`reason_help_${value}`)}</span>
                </span>
              </label>
            );
          })}
        </div>
        {error && <p id="stock-exit-reason-error" className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </FormRequiredSection>
  );
}
