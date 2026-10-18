'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import { arrowStep } from './arrowStep';
import { ChoiceCard } from './ChoiceCard';

interface OptionRadioProps<V extends string> {
  label: string;
  value: V | null;
  onChange: (value: V) => void;
  options: readonly { value: V; title: string; text?: string }[];
  /** Phrase de repère sous les options (avis des écoles). */
  help?: string;
  error?: string;
}

/** Question d'une feuille de saisie (« De quoi s'agit-il ? ») : options côte à côte, rien de coché d'avance. */
export function OptionRadio<V extends string>({ label, value, onChange, options, help, error }: OptionRadioProps<V>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = value === null ? 0 : options.findIndex((o) => o.value === value);
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = arrowStep(event);
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (option === undefined) return;
    refs.current[next]?.focus();
    onChange(option.value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p id={`${id}-label`} className="text-[0.8125rem] font-medium text-foreground">{label}</p>
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-invalid={error ? true : undefined}
        className="grid grid-cols-2 gap-2">
        {options.map((option, index) => (
          <ChoiceCard key={option.value} buttonRef={(el) => { refs.current[index] = el; }}
            title={option.title} text={option.text} chips={[]} checked={value === option.value}
            focusable={index === focusIndex} onSelect={() => onChange(option.value)} onKeyDown={(e) => move(e, index)} />
        ))}
      </div>
      {help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
