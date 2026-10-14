'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { MESSAGE_TONES, type MessageTone } from '@/lib/hooks/useMessageTemplates';

/** Deux cartes à choix (« Chaleureux », « Professionnel »), chacune avec un exemple de relance. */
export function ToneCards({ value, onChange }: { value: MessageTone; onChange: (tone: MessageTone) => void }) {
  const t = useTranslations('settings.messages');
  const name = useId();

  return (
    <div role="radiogroup" aria-label={t('tone_aria')}
      className="grid grid-cols-[repeat(auto-fit,minmax(min(13.75rem,100%),1fr))] gap-3">
      {MESSAGE_TONES.map((tone) => (
        <label key={tone}
          className="flex cursor-pointer flex-col gap-1.5 rounded-[0.875rem] border border-border bg-card p-3.5 text-start text-foreground transition-colors hover:bg-muted/50 has-checked:border-primary has-checked:bg-secondary has-checked:ring-1 has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary">
          <input type="radio" name={name} value={tone} checked={value === tone} onChange={() => onChange(tone)} className="sr-only" />
          <span className="flex w-full items-center justify-between gap-2">
            <span className="text-[0.9375rem] font-semibold">{t('tone', { tone })}</span>
            <span aria-hidden
              className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 ${value === tone ? 'border-primary' : 'border-border'}`}>
              {value === tone && <span className="size-2 rounded-full bg-primary" />}
            </span>
          </span>
          <span className="text-[0.8125rem] leading-[1.45] text-muted-foreground">{t('tone_example', { tone })}</span>
        </label>
      ))}
    </div>
  );
}
